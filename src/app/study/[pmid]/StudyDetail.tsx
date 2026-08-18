"use client";

import { useState } from "react";
import Link from "next/link";
import type { PubMedStudy } from "@/lib/pubmed";

interface StudyDetailProps {
  study: PubMedStudy;
  source: "saved" | "live";
}

/**
 * StudyDetail — the core Explorer page.
 *
 * Product principle (per the project spec):
 *   1. The raw source (abstract) is always shown — the AI is an interpreter,
 *      never the source.
 *   2. Source facts, AI interpretation, and practical implications stay
 *      visually and structurally distinct.
 *   3. Structured sections are rendered here; they are populated by the AI
 *      extraction pipeline in a later phase.
 */
export default function StudyDetail({ study, source }: StudyDetailProps) {
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

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
            What the study actually says (abstract)
          </h2>
          <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-line">
            {study.abstract}
          </p>
        </section>

        {/* ============ STRUCTURED INTERPRETATION ============ */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4 pb-2 border-b border-gray-200">
            Study breakdown
          </h2>
          <div className="space-y-4">
            <BreakdownSection label="What question was the study asking?">
              AI extraction coming in a later phase.
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
            <BreakdownSection label="What did the researchers conclude?">
              Authors' stated conclusion, kept separate from AI interpretation.
            </BreakdownSection>
          </div>
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
      <p className="text-sm text-gray-400 italic">{children}</p>
    </div>
  );
}