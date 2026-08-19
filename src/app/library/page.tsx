import type { Metadata } from "next";
import Link from "next/link";
import AuthStatus from "@/components/AuthStatus";
import LibraryList from "./LibraryList";
import { supabase } from "@/lib/supabase";

/**
 * Library page — lists every study saved into the shared `studies` table
 * (newest first).
 *
 * Product rule: `studies` is the shared public library (like Wikipedia
 * entries) — anyone can READ and INSERT, nobody can modify existing rows.
 * No new RLS needed: the existing "Public read studies" SELECT policy
 * already covers this page.
 *
 * Next.js 16: this route is NOT using Cache Components (next.config.ts has
 * no `cacheComponents`), and the supabase client isn't a cached fetch, so we
 * opt the route out of static prerendering explicitly — the `studies` table
 * changes every time someone saves a study and the list must stay fresh.
 */
export const metadata: Metadata = {
  title: "Library",
  description:
    "Your saved exercise-science studies — the shared public library of PubMed records you've bookmarked on Study Hub.",
  openGraph: {
    type: "website",
    url: "/library",
    title: "Library | Study Hub",
    description:
      "Your saved exercise-science studies — the shared public library of PubMed records you've bookmarked on Study Hub.",
  },
};

export const dynamic = "force-dynamic";

interface SavedStudy {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  publicationDate: string | null;
  abstract: string;
}

export default async function LibraryPage() {
  const { data: rows, error } = await supabase
    .from("studies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Library load failed:", error);
  }

  // Map the DB rows (snake_case, nullable) onto the same display shape the
  // home-page search cards use, so the card markup can be reused verbatim.
  const studies: SavedStudy[] = (rows ?? []).map((row) => ({
    pmid: row.pmid,
    title: row.title,
    authors: row.authors ?? "Unknown Authors",
    journal: row.journal ?? "Unknown Journal",
    publicationDate: row.publication_date,
    abstract: row.abstract ?? "No abstract available",
  }));

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Library</h1>
          <div className="flex items-center gap-4">
            <AuthStatus />
            <Link
              href="/articles"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              My Articles →
            </Link>
            <Link
              href="/graph"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Evidence Graph →
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Back to search
            </Link>
          </div>
        </div>

        {error ? (
          <div className="border border-red-200 bg-red-50 rounded-xl p-6 text-red-700 text-sm">
            Failed to load the library. Please try again later.
          </div>
        ) : (
          // Task 22 — LibraryList is a client list: it shows the count + cards,
          // and "Remove from Library" (StudyCard onRemoved) drops a card from
          // view + updates the count without a server re-fetch.
          <LibraryList studies={studies} />
        )}
      </div>
    </div>
  );
}