"use client";

import { useState } from "react";
import Link from "next/link";
import StudyCard, { type StudyCardProps } from "@/components/StudyCard";

/**
 * Task 22 — Library management.
 *
 * Client list for the Library page. It owns the list in local state so that
 * "Remove from Library" (which StudyCard fires via `onRemoved` after a
 * successful `DELETE /api/study/[pmid]`) removes the card from view AND
 * updates the "N saved studies" count immediately, without a server re-fetch.
 * When the last card is removed it falls back to the empty state.
 */
export default function LibraryList({
  studies,
}: {
  studies: StudyCardProps[];
}) {
  const [items, setItems] = useState(studies);

  const handleRemoved = (pmid: string) => {
    setItems((prev) => prev.filter((s) => s.pmid !== pmid));
  };

  if (items.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 bg-white rounded-xl p-12 text-center dark:border-gray-700 dark:bg-gray-900">
        <p className="text-lg font-semibold text-gray-700 mb-2 dark:text-gray-200">
          No saved studies yet
        </p>
        <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
          Go search PubMed and save studies to build your library.
        </p>
        <Link
          href="/"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Search PubMed →
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
        {items.length} saved {items.length === 1 ? "study" : "studies"}
      </p>
      <div className="flex flex-col gap-6">
        {items.map((study) => (
          <StudyCard key={study.pmid} {...study} onRemoved={handleRemoved} />
        ))}
      </div>
    </>
  );
}
