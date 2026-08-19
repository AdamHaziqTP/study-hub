"use client";

import { useState } from "react";
import Link from "next/link";
import { useVisitedStudies } from "@/lib/useVisitedStudies";
import { useSavedStudies } from "@/lib/useSavedStudies";
import { decodeEntities } from "@/lib/entities";

/**
 * The shared study card used by BOTH the home search results (`HomeSearch`)
 * and the Library page.
 *
 * Task 20 — Visited-links indicator: cards show a distinct "✓ Visited"
 * treatment (blue tint + badge + blue title link) for PMIDs the user has
 * already clicked. Gated on `hydrated` so it never causes an SSR mismatch.
 *
 * Task 21 — Quick-save bookmark: a bookmark button on each card saves the
 * study to the Library (`/api/save-study`, check-then-insert) without opening
 * it. It reflects already-saved state (filled icon when the PMID is in the
 * `studies` library), disables while saving, and shows an inline error on
 * failure. Gated on `loaded` so the icon never causes an SSR/hydration mismatch.
 *
 * Task 22 — Library management: the bookmark is now a toggle. When a study is
 * already saved (filled), clicking it REMOVES it from the Library via
 * `DELETE /api/study/[pmid]` (outline again), so the card shows both the
 * "Already in Library" state (filled bookmark + "Remove from Library" title)
 * and the remove action. `onRemoved` lets a parent list (e.g. the Library page)
 * drop the card from view after a successful remove.
 */
export interface StudyCardProps {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  publicationDate: string | null;
  abstract: string;
  /** Optional: called after this study is removed from the Library. */
  onRemoved?: (pmid: string) => void;
}

export default function StudyCard({
  pmid,
  title,
  authors,
  journal,
  publicationDate,
  abstract,
  onRemoved,
}: StudyCardProps) {
  const { visited, hydrated, markVisited } = useVisitedStudies();
  const { saved, loaded, markSaved, markUnsaved } = useSavedStudies();
  const isVisited = hydrated && visited.has(pmid);
  const isSaved = loaded && saved.has(pmid);

  // Task 23 — decode HTML entities (&#xb0;, &lt;, &micro;, …) to proper
  // symbols for display. Task 24 — show the FULL publication date, not just
  // the year.
  const displayTitle = decodeEntities(title);
  const displayAuthors = decodeEntities(authors);
  const displayJournal = decodeEntities(journal);
  const displayAbstract = decodeEntities(abstract);
  const displayDate = publicationDate
    ? decodeEntities(publicationDate)
    : null;

  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (isSaved || busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/save-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pmid,
          title,
          abstract,
          authors,
          journal,
          publicationDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error || "Couldn't save to Library");
        return;
      }
      markSaved(pmid);
    } catch (err) {
      console.error("Quick-save failed", err);
      setSaveError("Couldn't save to Library. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!isSaved || busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/study/${encodeURIComponent(pmid)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error || "Couldn't remove from Library");
        return;
      }
      markUnsaved(pmid);
      onRemoved?.(pmid);
    } catch (err) {
      console.error("Remove-from-library failed", err);
      setSaveError("Couldn't remove from Library. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleBookmark = () => {
    if (isSaved) {
      void handleRemove();
    } else {
      void handleSave();
    }
  };

  return (
    <div
      className={`border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow ${
        isVisited ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/study/${pmid}`}
          onClick={() => markVisited(pmid)}
          className="min-w-0"
        >
          <h2
            className={`text-xl font-semibold mb-2 leading-snug transition-colors ${
              isVisited ? "text-blue-800" : "text-gray-900 hover:text-blue-700"
            }`}
          >
            {displayTitle}
          </h2>
        </Link>
        <div className="flex items-start gap-2 flex-shrink-0">
          {isVisited && (
            <span className="mt-1 inline-block bg-blue-600 text-white text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
              ✓ Visited
            </span>
          )}
          <button
            type="button"
            onClick={handleBookmark}
            disabled={busy}
            title={isSaved ? "Remove from Library" : "Save to Library"}
            aria-label={isSaved ? "Remove from Library" : "Save to Library"}
            className={`mt-1 p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              busy
                ? "text-blue-300 cursor-wait"
                : isSaved
                ? "text-blue-600"
                : "text-gray-400 hover:text-blue-600"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill={isSaved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {saveError && <p className="mt-1 text-sm text-red-600">{saveError}</p>}

      <div className="text-sm text-gray-500 mb-4 font-medium">
        {displayAuthors} • <span className="italic">{displayJournal}</span> (
        {displayDate ?? "Unknown date"}) • PMID: {pmid}
      </div>
      <p className="text-gray-700 text-sm line-clamp-3 mb-4 leading-relaxed">
        {displayAbstract}
      </p>
      <div className="flex justify-end">
        <Link
          href={`/study/${pmid}`}
          onClick={() => markVisited(pmid)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          View Study →
        </Link>
      </div>
    </div>
  );
}
