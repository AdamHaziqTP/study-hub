/**
 * Server-only AI helper for Study Hub.
 *
 * Uses the DeepSeek API (OpenAI-compatible). The model is chosen EXPLICITLY
 * in code via DEEPSEEK_MODEL (default: "deepseek-chat" — DeepSeek's cheap
 * general-purpose model). An API key alone does NOT pick the model.
 *
 * NEVER import this file into a client component — it reads server-side env
 * vars (DEEPSEEK_API_KEY, DEEPSEEK_MODEL).
 *
 * Job 1 = EXTRACT + GROUNDED INTERPRETATION. Two tiers of limitations:
 *   - limitations: ONLY limitations explicitly stated BY THE PAPER.
 *   - identified_limitations: potential limitations DERIVED by reasoning from
 *     the stated design (measurement method, sample, population, protocol…).
 *     Each carries a `based_on` field citing the exact stated fact it derives
 *     from. This is clearly-labelled interpretation, traceable to the source.
 *
 * The AI reads the abstract AND, when available, the full text (via PMC),
 * so the app is more than just a "PubMed reskin" — it reasons over the
 * full study and explains why findings may not generalise.
 */

export interface IdentifiedLimitation {
  limitation: string;
  based_on: string;
}

export interface StudyContext {
  research_question: string | null;
  study_design: string | null;
  sample_size: number | null;
  population: string | null;
  training_status: string | null;
  duration: string | null;
  intervention: string | null;
  control: string | null;
  outcomes: string | null;
  findings: string | null;
  /** Stated by the paper itself (may be null). */
  limitations: string | null;
  /** Derived by reasoning from the stated design; each grounded in a fact. */
  identified_limitations: IdentifiedLimitation[];
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_API_KEY is not set in .env.local");
  }
  return key;
}

const SYSTEM_PROMPT = `You are an information extractor for an exercise-science research app.
Extract structured facts from the study title, abstract, and (when provided) full text.

Rules:
- DO NOT judge whether the study is good or bad.
- DO NOT rate reliability or credibility.
- Extract facts EXACTLY as stated by the source. If a field is not stated, use null.
- sample_size must be a number (participant/subject count) or null if not stated.

TWO-TIER LIMITATIONS (this is the most important part):
1. "limitations": ONLY limitations explicitly stated BY THE PAPER itself.
   If the paper states none, this must be null. Never put derived commentary here.
2. "identified_limitations": STRICTLY OPTIONAL. Potential limitations DERIVED by
   reasoning from the STATED design (e.g. measurement method, sample size,
   population, training status not described, protocol details not reported,
   potential for short-term effects like swelling to confound muscle-size
   measurement). This is interpretation, clearly separated from the paper's
   own words. For each item you MUST include a "based_on" field that quotes
   the exact stated fact it derives from. Do NOT invent speculative flaws that
   cannot be traced to a stated detail of the study.

Examples of good identified_limitations for an MRI hypertrophy study:
- limitation: "Changes in MRI-measured muscle volume may partly reflect acute training-induced swelling rather than true tissue growth"
  based_on: "MRI-measured muscle volume was assessed pre- and post-training"
- limitation: "Training status of participants was not described, so results may not generalise to trained lifters"
  based_on: "21 adults conducted elbow extensions" (no training history given)

Return ONLY valid JSON matching this exact shape:
{
  "research_question": string|null,
  "study_design": string|null,
  "sample_size": number|null,
  "population": string|null,
  "training_status": string|null,
  "duration": string|null,
  "intervention": string|null,
  "control": string|null,
  "outcomes": string|null,
  "findings": string|null,
  "limitations": string|null,
  "identified_limitations": [{"limitation": string, "based_on": string}]
}`;

/** Job-1 extraction: title + abstract (+ optional full text) -> validated StudyContext. */
export async function extractStudyContext(input: {
  title: string;
  abstract: string;
  fullText?: string | null;
}): Promise<StudyContext> {
  const parts = [`Title: ${input.title}`, `Abstract:\n${input.abstract}`];
  if (input.fullText) {
    parts.push(`Full text (excerpt):\n${input.fullText}`);
  }

  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parts.join("\n\n") },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("DeepSeek API error:", response.status, text);
    throw new Error(`DeepSeek API request failed (${response.status})`);
  }

  const json = await response.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new Error("DeepSeek returned no message content");
  }

  return validateAndNormalize(raw);
}

/** Parse + validate the AI JSON before it can touch the DB/UI. */
function validateAndNormalize(raw: string): StudyContext {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI output was not valid JSON");
  }

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

  let sampleSize: number | null = null;
  if (typeof parsed.sample_size === "number" && Number.isFinite(parsed.sample_size)) {
    sampleSize = parsed.sample_size;
  } else if (typeof parsed.sample_size === "string") {
    const n = parseInt(parsed.sample_size, 10);
    if (Number.isFinite(n)) sampleSize = n;
  }

  // Validate the derived-limitations array: every item must have a
  // limitation string AND a based_on string; drop anything malformed.
  let identifiedLimitations: IdentifiedLimitation[] = [];
  if (Array.isArray(parsed.identified_limitations)) {
    identifiedLimitations = parsed.identified_limitations
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object"
      )
      .map((item) => ({
        limitation: str(item.limitation),
        based_on: str(item.based_on),
      }))
      .filter(
        (item): item is IdentifiedLimitation =>
          item.limitation !== null && item.based_on !== null
      );
  }

  return {
    research_question: str(parsed.research_question),
    study_design: str(parsed.study_design),
    sample_size: sampleSize,
    population: str(parsed.population),
    training_status: str(parsed.training_status),
    duration: str(parsed.duration),
    intervention: str(parsed.intervention),
    control: str(parsed.control),
    outcomes: str(parsed.outcomes),
    findings: str(parsed.findings),
    limitations: str(parsed.limitations),
    identified_limitations: identifiedLimitations,
  };
}