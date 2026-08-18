import Link from "next/link";
import AuthStatus from "@/components/AuthStatus";
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
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Library</h1>
          <div className="flex items-center gap-4">
            <AuthStatus />
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
        ) : studies.length === 0 ? (
          <div className="border border-dashed border-gray-300 bg-white rounded-xl p-12 text-center">
            <p className="text-lg font-semibold text-gray-700 mb-2">
              No saved studies yet
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Go search PubMed and save studies to build your library.
            </p>
            <Link
              href="/"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Search PubMed →
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">
              {studies.length} saved {studies.length === 1 ? "study" : "studies"}
            </p>

            <div className="flex flex-col gap-6">
              {studies.map((study) => (
                <div
                  key={study.pmid}
                  className="border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white"
                >
                  <Link href={`/study/${study.pmid}`}>
                    <h2 className="text-xl font-semibold mb-2 text-gray-900 leading-snug hover:text-blue-700 transition-colors">
                      {study.title}
                    </h2>
                  </Link>
                  <div className="text-sm text-gray-500 mb-4 font-medium">
                    {study.authors} •{" "}
                    <span className="italic">{study.journal}</span> (
                    {study.publicationDate?.slice(0, 4) ?? "Unknown year"}) •
                    PMID: {study.pmid}
                  </div>
                  <p className="text-gray-700 text-sm line-clamp-3 mb-4 leading-relaxed">
                    {study.abstract}
                  </p>
                  <div className="flex justify-end">
                    <Link
                      href={`/study/${study.pmid}`}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                      View Study →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}