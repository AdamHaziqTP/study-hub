/**
 * Server-only AI helper for Study Hub.
 *
 * Uses the DeepSeek API (OpenAI-compatible). The model is chosen EXPLICITLY
 * in code via DEEPSEEK_MODEL (default: "deepseek-chat" — DeepSeek's cheap
 * general-purpose model). An API key alone does NOT pick the model.
 *
 * IMPORTANT: every AI job uses the SAME model resolution (getModel()) — the
 * env override or the cheap fast default. There is deliberately NO separate
 * heavier-model logic: the app keeps one cheap model for all jobs (see §8 of
 * PROJECT_NOTES.md).
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
 * Job 2 = EXPLAIN: plain-English re-explanation for a curious lifter
 *   (simplifyStudy) — the "In plain English" block on the study page.
 *
 * Job 3b = CLAIM ALIGNMENT: verdict on whether a user's claim accurately
 *   represents its linked studies (assessClaimAlignment). Cheap fast model
 *   only — no separate heavier model.
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

/** Job 2 output: a plain-English re-explanation of the study. */
export interface StudySimplification {
  simplified_text: string;
}

export type ClaimAlignmentVerdict = "aligned" | "partially_aligned" | "unaligned";

/** Job 3b output: a verdict on whether a claim accurately represents its studies. */
export interface ClaimAlignment {
  verdict: ClaimAlignmentVerdict;
  reasoning: string;
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_API_KEY is not set in .env.local");
  }
  return key;
}

/**
 * Resolve the model for EVERY AI job: the DEEPSEEK_MODEL env override, or the
 * cheap fast default ("deepseek-chat"). Shared by extract, simplify, and claim
 * alignment — per §8 there is intentionally no separate heavier model.
 */
function getModel(): string {
  return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
}

/**
 * Shared DeepSeek call. All jobs expect strict JSON output (validated before
 * it can touch the DB/UI). Returns the raw message content string.
 */
async function callDeepSeek(systemPrompt: string, userContent: string): Promise<string> {
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
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

  return raw;
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

  const raw = await callDeepSeek(SYSTEM_PROMPT, parts.join("\n\n"));
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

const SIMPLIFY_SYSTEM_PROMPT = `You are a plain-language science explainer for an exercise-science research app.
Re-explain the study below to a curious lifter who is NOT a scientist.

Rules:
- Explain what the study tested, who was studied, how it was conducted, what was measured, and what the authors found.
- Use simple, everyday language. Avoid jargon; if a technical term is unavoidable, give a quick everyday gloss.
- Stay strictly faithful to the source. DO NOT add findings or claims the source does not support.
- DO NOT judge the study or rate its reliability. DO NOT give training advice.
- Keep it concise — roughly 150 to 250 words.

Return ONLY valid JSON matching this exact shape:
{
  "simplified_text": string
}`;

/** Job-2 simplification: title + abstract (+ optional full text) -> plain-English text. */
export async function simplifyStudy(input: {
  title: string;
  abstract: string;
  fullText?: string | null;
}): Promise<StudySimplification> {
  const parts = [`Title: ${input.title}`, `Abstract:\n${input.abstract}`];
  if (input.fullText) {
    parts.push(`Full text (excerpt):\n${input.fullText}`);
  }

  const raw = await callDeepSeek(SIMPLIFY_SYSTEM_PROMPT, parts.join("\n\n"));

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI output was not valid JSON");
  }

  if (
    typeof parsed.simplified_text !== "string" ||
    parsed.simplified_text.trim() === ""
  ) {
    throw new Error("AI output was missing simplified_text");
  }

  return { simplified_text: parsed.simplified_text.trim() };
}

const ASSESS_CLAIM_SYSTEM_PROMPT = `You are an evidence-integrity checker for an exercise-science research app.
A user has written a CLAIM and linked it to one or more STUDIES (each tagged with the relationship the user chose:
"supports", "contradicts", "mixed", or "contextual"). Your job is to judge whether the claim ACCURATELY represents
what the linked studies actually show.

Rules:
- Compare the claim ONLY against the abstracts (and findings, when provided) of the linked studies.
- Consider the relationship tag: a study linked as "contradicts" should NOT be expected to agree with the claim;
  judge whether the study genuinely contradicts the claim, etc.
- Verdict semantics:
  - "aligned": the claim is a fair representation of the linked studies' content.
  - "partially_aligned": the claim is broadly in the right direction but overstates, understates, or brushes over nuance
    (e.g. magnitude, population, context, conflicting results between the linked studies).
  - "unaligned": the claim misrepresents the studies — it contradicts what they found, overstates beyond what any
    study supports, or has no meaningful basis in the provided abstracts.
- Give "reasoning": 1-3 short sentences in plain English, quoting or pointing at the specific study detail that drives
  the verdict. This is for the user editing their article — be specific and useful.
- DO NOT rate the studies' quality or reliability. DO NOT police wording style, only accuracy.

Return ONLY valid JSON matching this exact shape:
{
  "verdict": "aligned" | "partially_aligned" | "unaligned",
  "reasoning": string
}`;

export interface ClaimStudyInput {
  pmid: string;
  title: string;
  abstract: string;
  /** Optional AI-extracted findings from the study_context table, when available. */
  findings?: string | null;
  /** Relationship the user chose when linking this study to the claim. */
  relationship?: string;
}

/** Job-3b claim alignment: does the claim accurately represent its linked studies? */
export async function assessClaimAlignment(input: {
  claimText: string;
  studies: ClaimStudyInput[];
}): Promise<ClaimAlignment> {
  if (input.studies.length === 0) {
    throw new Error("No linked studies to assess against");
  }

  const studiesBlock = input.studies
    .map((s, i) => {
      const rel = s.relationship?.trim() || "supports";
      const parts = [
        `Study ${i + 1} (PMID ${s.pmid}, linked as "${rel}"):`,
        `Title: ${s.title}`,
        `Abstract:\n${s.abstract}`,
      ];
      if (s.findings && s.findings.trim() !== "") {
        parts.push(`Findings:\n${s.findings.trim()}`);
      }
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  const userContent = `Claim:\n${input.claimText}\n\nLinked studies:\n\n${studiesBlock}`;

  const raw = await callDeepSeek(ASSESS_CLAIM_SYSTEM_PROMPT, userContent);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI output was not valid JSON");
  }

  const verdict = parsed.verdict;
  if (
    verdict !== "aligned" &&
    verdict !== "partially_aligned" &&
    verdict !== "unaligned"
  ) {
    throw new Error("AI output had an invalid verdict");
  }

  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.trim() !== ""
      ? parsed.reasoning.trim()
      : null;
  if (!reasoning) {
    throw new Error("AI output was missing reasoning");
  }

  return { verdict, reasoning };
}