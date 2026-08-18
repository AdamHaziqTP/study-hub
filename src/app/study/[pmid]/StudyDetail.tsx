"use client";

import { useState } from "react";
import Link from "next/link";
import type { PubMedStudy } from "@/lib/pubmed";
import type { StudyContext } from "@/lib/ai";

interface StudyDetailProps {
  study: PubMedStudy;
  source: "saved" | "live";
  /** Previously-generated context loaded from the DB (null when none exists). */
  savedContext?: StudyContext | null;
  savedSourceInfo?: string | null;
}

type ContextState = "idle" | "loading" | "done" | "error";

/**
 * StudyDetail — the core Explorer page.
 *
 * Product principle (per the project spec):
 *   1. The raw source (abstract/full text) is always shown first — the AI is
 *      an interpreter, never the source.
 *   2. Source facts, AI interpretation, and practical implications stay
 *      visually and structurally distinct.
 *   3. The AI-extracted breakdown is generated on demand, persisted to the
 *      regenerable `study_context` table, and re-loaded from the DB on
 *      revisit (DB-first; no AI call needed if it exists).
 */
export default function StudyDetail({
  study,
  source,
  savedContext = null,
  savedSourceInfo = null,
}: StudyDetailProps) {
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  // Study breakdown (AI extraction) state.
  // If a saved context exists in the DB we render it immediately (DB-first,
  // no AI call on revisit); otherwise the user can generate one.
  const [contextState, setContextState] = useState<ContextState>(
    savedContext ? "done" : "idle"
  );
  const [context, setContext] = useState<StudyContext | null>(savedContext);
  const [sourceInfo, setSourceInfo] = useState<string | null>(savedSourceInfo);
  const [contextError, setContextError] = useState<string | null>(null);
  const [savingContext, setSavingContext] = useState(false);
  const [contextSaveError, setContextSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveState("idle");
    try {
      const res = await fetch("/api/save-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(study),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Generate the AI-extracted context for this study: call the extraction
   * pipeline (/api/extract-context), then persist the validated result into
   * the regenerable study_context table (/api/save-context). Persistence
   * failure is surfaced but does NOT hide the freshly generated context.
   */
  const handleGenerateContext = async () => {
    setContextState("loading");
    setContextError(null);
    setContextSaveError(null);
    try {
      const res = await fetch("/api/extract-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmid: study.pmid }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Extraction failed");
      }
      const json = await res.json();
      const newContext = json.context as StudyContext;
      const newSourceInfo = json.sourceInfo as string;

      setContext(newContext);
      setSourceInfo(newSourceInfo);
      setContextState("done");

      // Persist into the regenerable study_context table.
      setSavingContext(true);
      try {
        const saveRes = await fetch("/api/save-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            study,
            context: newContext,
            sourceInfo: newSourceInfo,
          }),
        });
        if (!saveRes.ok) {
          const saveJson = await saveRes.json().catch(() => ({}));
          throw new Error(saveJson.error ?? "Save failed");
        }
      } catch (saveErr) {
        setContextSaveError(
          saveErr instanceof Error ? saveErr.message : "Failed to persist context"
        );
      } finally {
        setSavingContext(false);
      }
    } catch (err) {
      setContextState("error");
      setContextError(err instanceof Error ? err.message : "Extraction failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto p-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Back to search
          </Link>
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${
              source === "saved"
                ? "bg-green-100 text-green-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {source === "saved" ? "Saved in library" : "Fetched live from PubMed"}
          </span>
        </div>

        {/* Header — the raw study facts */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold leading-tight mb-3">{study.title}</h1>
          <div className="text-sm text-gray-600 space-y-1">
            <p>{study.authors}</p>
            <p className="italic">
              {study.journal}
              {study.publicationDate ? ` · ${study.publicationDate.slice(0, 4)}` : ""}
            </p>
            <p className="font-mono text-gray-500">PMID: {study.pmid}</p>
          </div>
        </header>

        {/* Actions */}
        <div className="flex gap-3 mb-10">
          <button
            onClick={handleSave}
            disabled={saving || saveState === "saved"}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
          >
            {saving ? "Saving..." : saveState === "saved" ? "Saved to Library ✓" : "Save to Library"}
          </button>
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${study.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-300 bg-white text-gray-700 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition-colors text-sm"
          >
            View original on PubMed ↗
          </a>
        </div>

        {saveState === "error" && (
          <div className="mb-8 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Failed to save. Please try again.
          </div>
        )}

        {/* ============ RAW SOURCE ============ */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3 pb-2 border-b border-gray-200">
            What the study actually says
          </h2>
          <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-line">
            {study.abstract}
          </p>
        </section>

        {/* ============ STRUCTURED INTERPRETATION ============ */}
        <section className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-2 border-b border-gray-200">
            <h2 className="text-lg font-bold">Study breakdown</h2>
            <div className="flex items-center gap-3">
              {sourceInfo && <SourceInfoBadge sourceInfo={sourceInfo} />}
              <button
                onClick={handleGenerateContext}
                disabled={contextState === "loading" || savingContext}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
              >
                {contextState === "loading"
                  ? "Extracting…"
                  : savingContext
                    ? "Saving context…"
                    : savedContext
                      ? "Regenerate context"
                      : "Generate context"}
              </button>
            </div>
          </div>

          {contextState === "error" && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Failed to generate the context.
              {contextError ? ` ${contextError}` : ""}
            </div>
          )}

          {contextState === "done" && contextSaveError && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              Context generated, but could not be saved to the library.
              {contextSaveError ? ` ${contextSaveError}` : ""}
            </div>
          )}

          {contextState === "loading" && (
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-gray-200 bg-white animate-pulse"
                >
                  <div className="h-3 w-32 bg-gray-200 rounded mb-3" />
                  <div className="h-3 w-full bg-gray-100 rounded mb-1.5" />
                  <div className="h-3 w-4/5 bg-gray-100 rounded" />
                </div>
              ))}
              <p className="text-sm text-gray-500 text-center pt-1">
                Reading the study and extracting structured information…
              </p>
            </div>
          )}

          {contextState === "done" && context ? (
            <div className="space-y-4">
              <BreakdownSection label="What question was the study asking?">
                <FieldRow label="Research question" value={context.research_question} />
              </BreakdownSection>

              <BreakdownSection label="Who was studied?">
                <div className="grid gap-2">
                  <FieldRow
                    label="Sample size"
                    value={context.sample_size !== null ? String(context.sample_size) : null}
                  />
                  <FieldRow label="Population" value={context.population} />
                  <FieldRow label="Training status" value={context.training_status} />
                </div>
              </BreakdownSection>

              <BreakdownSection label="How was it conducted?">
                <div className="grid gap-2">
                  <FieldRow label="Study design" value={context.study_design} />
                  <FieldRow label="Duration" value={context.duration} />
                  <FieldRow label="Intervention" value={context.intervention} />
                  <FieldRow label="Control" value={context.control} />
                </div>
              </BreakdownSection>

              <BreakdownSection label="What did they measure and find?">
                <div className="grid gap-2">
                  <FieldRow label="Outcomes measured" value={context.outcomes} />
                  <FieldRow label="Findings" value={context.findings} />
                </div>
              </BreakdownSection>

              <BreakdownSection label="Limitations stated by the paper">
                {context.limitations ? (
                  <p className="text-sm text-gray-800">{context.limitations}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    None stated in the source.
                  </p>
                )}
              </BreakdownSection>

              {context.identified_limitations.length > 0 && (
                <div className="p-4 rounded-xl border border-gray-200 bg-white">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Identified limitations (AI-derived, each grounded in a stated fact)
                  </h3>
                  <div className="space-y-3">
                    {context.identified_limitations.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-amber-50 border border-amber-200 p-3"
                      >
                        <p className="text-sm text-gray-800">{item.limitation}</p>
                        <p className="text-xs text-amber-700 mt-1.5">
                          <span className="font-semibold">Based on:</span> “{item.based_on}”
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : contextState === "idle" ? (
            <div className="space-y-4">
              <BreakdownSection label="What question was the study asking?">
                AI extraction will appear here once generated.
              </BreakdownSection>
              <BreakdownSection label="Who was studied?">
                Population, sample size, and training status will appear here.
              </BreakdownSection>
              <BreakdownSection label="How was it conducted?">
                Study design, duration, intervention, and control conditions.
              </BreakdownSection>
              <BreakdownSection label="What did they measure and find?">
                Outcomes, measurements, and main findings.
              </BreakdownSection>
              <BreakdownSection label="Limitations">
                Paper-stated limitations and AI-identified limitations (with
                grounding quotes) will appear here.
              </BreakdownSection>
            </div>
          ) : null}
        </section>

        {/* ============ EVIDENCE CONTEXT ============ */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4 pb-2 border-b border-gray-200">
            Evidence context
          </h2>
          <div className="p-5 rounded-xl border border-dashed border-gray-300 bg-white">
            <p className="text-sm text-gray-500">
              This section will surface the factors that affect how broadly this
              study can be interpreted — sample size, study design, population,
              training status, duration, and measurement — with plain-language
              explanations of <em>why each factor matters</em>. No numerical
              &ldquo;credibility score&rdquo;; you'll get the context to judge for yourself.
            </p>
          </div>
        </section>

        {/* ============ APPLICATION ============ */}
        <section>
          <h2 className="text-lg font-bold mb-4 pb-2 border-b border-gray-200">
            What this might mean for training
          </h2>
          <div className="p-5 rounded-xl border border-dashed border-gray-300 bg-white">
            <p className="text-sm text-gray-500">
              This section will translate the findings into practical training
              considerations — clearly labelled as <em>interpretation</em>, with
              explicit cautions about what this study does <em>not</em> establish.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Badge showing which source the AI actually read (full text / abstract). */
function SourceInfoBadge({ sourceInfo }: { sourceInfo: string }) {
  const label =
    sourceInfo === "full_text"
      ? "AI read: full text (PMC)"
      : sourceInfo === "abstract_only"
        ? "AI read: abstract only"
        : "AI read: provided text";
  return (
    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-100 text-purple-800">
      {label}
    </span>
  );
}

/** Label + value row for a single structured fact. */
function FieldRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      {value !== null && value !== "" ? (
        <span className="text-sm text-gray-800">{value}</span>
      ) : (
        <span className="text-sm text-gray-400 italic">Not stated in the source</span>
      )}
    </div>
  );
}

function BreakdownSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-white">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>
      {children}
    </div>
  );
}