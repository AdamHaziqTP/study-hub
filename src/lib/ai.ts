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
 * Job 1 = EXTRACT ONLY. This function does NOT judge whether the study is
 * good/bad, does NOT rate reliability, and does NOT invent limitations. It
 * extracts what the abstract explicitly states and leaves unknown fields
 * null. Interpretation (Jobs 2/3) lives in future phases.
 */

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
  limitations: string | null;
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
Extract ONLY the structured facts that are explicitly stated or directly implied by the study title and abstract.

Rules:
- DO NOT judge whether the study is good or bad.
- DO NOT rate reliability or credibility.
- DO NOT invent limitations that the abstract does not mention.
- If a field is not stated, use null for that field.
- sample_size must be a number (participant/subject count) or null if not stated.

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
  "limitations": string|null
}`;

/** Job-1 extraction: title + abstract -> validated StudyContext. */
export async function extractStudyContext(input: {
  title: string;
  abstract: string;
}): Promise<StudyContext> {
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
        {
          role: "user",
          content: `Title: ${input.title}\n\nAbstract:\n${input.abstract}`,
        },
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
  };
}