"use client";

import Link from "next/link";
import { useVisitedStudies } from "@/lib/useVisitedStudies";

/**
 * Task 20 — Visited-links indicator.
 *
 * The shared study card used by BOTH the home search results (`HomeSearch`)
 * and the Library page. It tracks whether the user has already clicked/visited
 * this study (via `useVisitedStudies`, persisted in localStorage) and, when so,
 * applies a distinct visual treatment: a subtly blue-tinted card, a
 * "✓ Visited" badge, and a blue (instead of default) title link. The visited
 * style is gated on `hydrated` so it never causes an SSR/hydration mismatch —
 * on the server + first client render it renders identical to an unvisited card.
 */
export interface StudyCardProps {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  publicationDate: string | null;
  abstract: string;
}

export default function StudyCard({
  pmid,
  title,
  authors,
  journal,
  publicationDate,
  abstract,
}: StudyCardProps) {
  const { visited, hydrated, markVisited } = useVisitedStudies();
  const isVisited = hydrated && visited.has(pmid);

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
            {title}
          </h2>
        </Link>
        {isVisited && (
          <span className="flex-shrink-0 mt-1 inline-block bg-blue-600 text-white text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
            ✓ Visited
          </span>
        )}
      </div>
      <div className="text-sm text-gray-500 mb-4 font-medium">
        {authors} • <span className="italic">{journal}</span> (
        {publicationDate?.slice(0, 4) ?? "Unknown year"}) • PMID: {pmid}
      </div>
      <p className="text-gray-700 text-sm line-clamp-3 mb-4 leading-relaxed">
        {abstract}
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
