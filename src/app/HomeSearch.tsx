"use client";

import { useState } from "react";
import Link from "next/link";
import AuthStatus from "@/components/AuthStatus";

interface Study {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  publicationDate: string | null;
  abstract: string;
}

interface AiSearchResponse {
  data: Study[];
  translated: boolean;
  translatedQuery: string;
  explanation: string | null;
  originalTerm: string;
}

/**
 * HomeSearch — the client-side search UI of the home page (server shell in
 * `page.tsx` renders this so the route can export Next.js `metadata`).
 *
 * Task 15 — Smart AI-Assisted Search: the search bar accepts natural, layman
 * questions (e.g. "how many times a week should I train?"). The query is POSTed
 * to `/api/ai-search`, which translates it to an optimized PubMed query with
 * DeepSeek (server-side), runs the existing `searchPubMed` flow, and returns
 * results + the translated query. A visible "AI-translated query" disclosure
 * always shows the user exactly what was actually searched (and when the AI
 * translation failed, it transparently shows the raw term fallback).
 */
export default function HomeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Study[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disclosure state: what PubMed was actually searched (set after every search).
  const [translatedQuery, setTranslatedQuery] = useState<string | null>(null);
  const [wasTranslated, setWasTranslated] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Search failed");
        setResults([]);
        setTranslatedQuery(null);
        setWasTranslated(false);
        setExplanation(null);
        return;
      }
      const payload = json as AiSearchResponse;
      setResults(payload.data || []);
      setTranslatedQuery(payload.translatedQuery ?? trimmed);
      setWasTranslated(payload.translated === true);
      setExplanation(payload.explanation ?? null);
    } catch (error) {
      console.error("Search failed", error);
      setError("Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Evidence Hub</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <AuthStatus />
            <Link
              href="/library"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Library →
            </Link>
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
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask a question, e.g. "how many times a week should I train?"'
            className="flex-1 min-w-[260px] border border-gray-300 bg-white rounded-lg p-4 text-black text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? "Searching NLM..." : "Search PubMed"}
          </button>
        </form>

        {/* AI-Translated Query Disclosure */}
        {translatedQuery && !loading && (
          <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0">
                {wasTranslated ? (
                  <span className="inline-block bg-blue-600 text-white text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded">
                    AI-translated query
                  </span>
                ) : (
                  <span className="inline-block bg-gray-500 text-white text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded">
                    Term search (AI fallback)
                  </span>
                )}
              </span>
              <div className="text-sm text-gray-800">
                <p className="font-mono break-words leading-relaxed">
                  {translatedQuery}
                </p>
                {wasTranslated && explanation && (
                  <p className="mt-1 text-gray-600">{explanation}</p>
                )}
                {!wasTranslated && (
                  <p className="mt-1 text-gray-600">
                    The AI query translation was unavailable, so your text was
                    searched as-is.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results Grid */}
        <div className="flex flex-col gap-6">
          {results.map((study) => (
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
                {study.publicationDate?.slice(0, 4) ?? "Unknown year"}) • PMID:{" "}
                {study.pmid}
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
      </div>
    </div>
  );
}