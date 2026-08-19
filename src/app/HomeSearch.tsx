"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AuthStatus from "@/components/AuthStatus";
import ThemeToggle from "@/components/ThemeToggle";
import StudyCard from "@/components/StudyCard";
import EmptySearchState, { EXAMPLE_QUERIES } from "./EmptySearchState";

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
  /** Total NCBI hit count for the query (Task 17 — drives Load-more / end-of-results). */
  totalResults?: number;
}

/** Number of studies per page (Task 17 — "Load more" appends this many). */
const PAGE_SIZE = 10;

/**
 * Session-scoped search results cache, keyed by the committed URL query (`q`).
 *
 * Task 16 — Search persistence: the query lives in the URL (`/?q=...`), so the
 * browser Back button (or a link back from a study page) returns to the exact
 * previous search + results. This module-level cache lets a restored search
 * render INSTANTLY without re-running the expensive AI query translation
 * (DeepSeek) — the whole point of persisting search state rather than
 * re-searching on every Back nav. It lives at module scope (not component
 * state) so it survives client-side navigations where <HomeSearch> unmounts
 * and remounts (e.g. out to a study page and back).
 *
 * Task 17 — Pagination: the cached payload also stores `totalResults`, and
 * "Load more" APPENDS to the cached `data` array (deduped by PMID), so a Back
 * nav restores every page loaded so far — not just the first 10.
 */
const resultsCache = new Map<string, AiSearchResponse>();

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
 *
 * Task 16 — Search persistence: the committed search is pushed into the URL as
 * the `q` query param (`/?q=how+many+times+a+week+should+I+train%3F`), and the
 * URL `q` is the single source of truth for the search. Any change to `q`
 * (Back / Forward nav, a shared link, a typed URL) restores that search from
 * the module-level cache above when available — no DeepSeek re-run — and only
 * fetches fresh results (with a fresh AI translation) when the query has never
 * been seen in this session.
 *
 * Task 17 — Pagination / Load More: instead of a hardcoded 10-study limit, a
 * "Load more" button below the results fetches the NEXT page (`retstart` =
 * current result count) and APPENDS it to the existing list. Page 2+ reuses
 * the already-translated query by sending `translatedQuery` back to
 * `/api/ai-search` — the AI is NEVER re-run deep in the results. Loading /
 * error / end-of-results states are handled, and every appended page is
 * reconciled into the Task 16 `resultsCache`.
 */
export default function HomeSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  // Initialize directly from the cache when this exact query was searched
  // earlier in the session, so Back navs render results with zero flash.
  const initialCached = urlQuery ? resultsCache.get(urlQuery) : undefined;

  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState<Study[]>(initialCached?.data ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task 17 — pagination state: total NCBI hits + Load-more loading/error.
  const [totalResults, setTotalResults] = useState<number | null>(
    initialCached?.totalResults ?? null
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  // Disclosure state: what PubMed was actually searched (set after every search).
  const [translatedQuery, setTranslatedQuery] = useState<string | null>(
    initialCached?.translatedQuery ?? null
  );
  const [wasTranslated, setWasTranslated] = useState(
    initialCached?.translated === true
  );
  const [explanation, setExplanation] = useState<string | null>(
    initialCached?.explanation ?? null
  );

  // Guards: `searchIdRef` ignores stale async responses (fast consecutive
  // searches), `appliedQueryRef` avoids re-searching a query already on screen.
  const searchIdRef = useRef(0);
  const appliedQueryRef = useRef<string | null>(null);

  /**
   * Append `incoming` to `existing`, skipping PMIDs already shown (cheap
   * insurance against any overlap between ranked pages).
   */
  const mergeStudies = useCallback((existing: Study[], incoming: Study[]) => {
    const seen = new Set(existing.map((s) => s.pmid));
    return [...existing, ...incoming.filter((s) => !seen.has(s.pmid))];
  }, []);

  /** Run a full search (fetch → cache → apply state) for the given term. */
  const runSearch = useCallback(async (term: string) => {
    const id = ++searchIdRef.current;
    loadingMoreRef.current = false;
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: term, retmax: PAGE_SIZE, retstart: 0 }),
      });
      const json = await res.json();
      if (id !== searchIdRef.current) return; // a newer search superseded us
      if (!res.ok) {
        setError(json.error || "Search failed");
        setResults([]);
        setTranslatedQuery(null);
        setWasTranslated(false);
        setExplanation(null);
        setTotalResults(null);
        return;
      }
      const payload = json as AiSearchResponse;
      resultsCache.set(term, payload);
      setResults(payload.data || []);
      setTotalResults(payload.totalResults ?? null);
      setTranslatedQuery(payload.translatedQuery ?? term);
      setWasTranslated(payload.translated === true);
      setExplanation(payload.explanation ?? null);
    } catch (error) {
      console.error("Search failed", error);
      if (id !== searchIdRef.current) return;
      setError("Search failed. Please try again.");
      setResults([]);
      setTranslatedQuery(null);
      setWasTranslated(false);
      setExplanation(null);
      setTotalResults(null);
    } finally {
      if (id === searchIdRef.current) setLoading(false);
    }
  }, []);

  // Keep search state in sync with the URL: the `q` query param is the single
  // source of truth for the committed search. On Back nav (or any q change),
  // restore cached results instantly; only fetch when the query is new.
  useEffect(() => {
    const term = urlQuery;

    // Reflect the committed URL query in the input box.
    setQuery(term);

    if (!term) {
      // No committed search in the URL: reset to the initial empty state.
      appliedQueryRef.current = "";
      loadingMoreRef.current = false;
      setResults([]);
      setTranslatedQuery(null);
      setWasTranslated(false);
      setExplanation(null);
      setError(null);
      setTotalResults(null);
      setLoadingMore(false);
      setLoadMoreError(null);
      return;
    }

    if (appliedQueryRef.current === term) return; // already showing this search

    const cached = resultsCache.get(term);
    if (cached) {
      // Back nav / revisit: restore WITHOUT re-running the AI translation.
      appliedQueryRef.current = term;
      loadingMoreRef.current = false;
      setResults(cached.data || []);
      setTotalResults(cached.totalResults ?? null);
      setTranslatedQuery(cached.translatedQuery ?? term);
      setWasTranslated(cached.translated === true);
      setExplanation(cached.explanation ?? null);
      setError(null);
      setLoadingMore(false);
      setLoadMoreError(null);
      return;
    }

    // First visit to this query (fresh load / pasted URL): fetch + cache.
    appliedQueryRef.current = term;
    void runSearch(term);
  }, [urlQuery, runSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // Commit the query to the URL (e.g. `/?q=training+frequency`) so it can be
    // shared, bookmarked, and restored via the browser Back button.
    const params = new URLSearchParams(searchParams.toString());
    params.set("q", trimmed);
    router.push(`${pathname}?${params.toString()}`);

    // If the query is already the one in the URL, the q-change effect won't
    // re-fire — run the search directly so pressing Enter re-searches.
    if (trimmed === urlQuery) {
      void runSearch(trimmed);
    }
  };

  /**
   * Task 19 — run a search from an example chip (empty-state / zero-results
   * recovery). Same commit-to-URL behavior as `handleSearch` so the chip's
   * query becomes the shared, Back-restorable URL `q`.
   */
  const handleExampleSearch = useCallback(
    (term: string) => {
      setQuery(term);
      const params = new URLSearchParams(searchParams.toString());
      params.set("q", term);
      router.push(`${pathname}?${params.toString()}`);
      // If the chip's query is already the committed URL q (e.g. re-running a
      // failed zero-result search), the q-change effect won't re-fire — search
      // directly.
      if (term === urlQuery) {
        void runSearch(term);
      }
    },
    [router, pathname, searchParams, urlQuery, runSearch]
  );

  /**
   * Task 17 — Load more: fetch the NEXT page (offset = current result count)
   * and append it. Page 2+ REUSES the already-translated query by sending it
   * back to `/api/ai-search` — the AI translation is never re-run.
   */
  const loadMore = useCallback(async () => {
    const term = appliedQueryRef.current;
    if (!term) return;
    if (loadingMoreRef.current || loading) return;

    const searchIdAtStart = searchIdRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: term,
          retmax: PAGE_SIZE,
          retstart: results.length,
          // Reuse the first page's translation — never re-translate page 2+.
          translatedQuery: translatedQuery,
          translated: wasTranslated,
          explanation: explanation,
        }),
      });
      const json = await res.json();
      if (
        searchIdRef.current !== searchIdAtStart ||
        appliedQueryRef.current !== term
      ) {
        return; // a newer search superseded this load-more
      }
      if (!res.ok) {
        setLoadMoreError(json.error || "Failed to load more results");
        return;
      }
      const payload = json as AiSearchResponse;
      const merged = mergeStudies(results, payload.data || []);
      setResults(merged);
      if (typeof payload.totalResults === "number") {
        setTotalResults(payload.totalResults);
      }

      // Reconcile the Task 16 session cache with the appended page, so a Back
      // nav restores every page loaded so far.
      const cached = resultsCache.get(term);
      if (cached) {
        resultsCache.set(term, {
          ...cached,
          data: merged,
          totalResults: payload.totalResults ?? cached.totalResults,
        });
      } else {
        resultsCache.set(term, {
          data: merged,
          translated: wasTranslated,
          translatedQuery: translatedQuery ?? term,
          explanation: explanation ?? null,
          originalTerm: term,
          totalResults: payload.totalResults,
        });
      }
    } catch (error) {
      console.error("Load more failed", error);
      if (searchIdRef.current !== searchIdAtStart) return;
      setLoadMoreError("Failed to load more results. Please try again.");
    } finally {
      if (searchIdRef.current === searchIdAtStart) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [results, translatedQuery, wasTranslated, explanation, loading, mergeStudies]);

  // Task 17 — end-of-results detection: keep loading while the total hit count
  // is still unknown, or while we've shown fewer studies than NCBI reported.
  const hasMore =
    results.length > 0 &&
    (totalResults === null || results.length < totalResults);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            Evidence Hub
          </h1>
          <div className="flex items-center gap-4 flex-wrap">
            <AuthStatus />
            <ThemeToggle />
            <Link
              href="/library"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Library →
            </Link>
            <Link
              href="/articles"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              My Articles →
            </Link>
            <Link
              href="/graph"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Evidence Graph →
            </Link>
          </div>
        </div>

        {/* Task 18 — Sticky search header: the search bar and the AI-translated
            query disclosure stick to the top of the viewport while the user
            scrolls through the paginated results. `sticky top-0` + a high
            `z-20` keep it above the cards, and the translucent
            `bg-gray-50/95` + `backdrop-blur` keep the text readable over
            whatever scrolls underneath on both desktop and mobile.
            `-mx-8 px-8` bleeds the bar edge-to-edge across the page's outer
            `p-8` padding so the sticky surface reads as a real header. */}
        <div className="sticky top-0 z-20 -mx-8 px-8 pt-4 pb-4 mb-6 bg-gray-50/95 backdrop-blur border-b border-gray-200/80 shadow-sm dark:bg-gray-950/95 dark:border-gray-800">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Ask a question, e.g. "how many times a week should I train?"'
              className="w-full sm:w-auto sm:flex-1 sm:min-w-[260px] border border-gray-300 bg-white rounded-lg p-4 text-black text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? "Searching NLM..." : "Search PubMed"}
            </button>
          </form>

          {/* AI-Translated Query Disclosure */}
          {translatedQuery && !loading && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
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
              <div className="text-sm text-gray-800 dark:text-gray-100">
                <p className="font-mono break-words leading-relaxed">
                  {translatedQuery}
                </p>
                {wasTranslated && explanation && (
                  <p className="mt-1 text-gray-600 dark:text-gray-400">{explanation}</p>
                )}
                {!wasTranslated && (
                  <p className="mt-1 text-gray-600 dark:text-gray-400">
                    The AI query translation was unavailable, so your text was
                    searched as-is.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Task 19 — Empty state (onboarding): no search has been committed to
            the URL yet. Shows what Study Hub is + clickable example questions
            + a pointer to Library / Evidence Notebook, instead of a blank page. */}
        {!urlQuery && !error && (
          <EmptySearchState onExample={handleExampleSearch} />
        )}

        {/* Task 19 — Zero-results state: a search ran (urlQuery set) but PubMed
            returned nothing. Distinct from the empty pre-search state above. */}
        {urlQuery && !loading && !error && results.length === 0 && (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-3xl" aria-hidden>
              🔍
            </p>
            <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">
              No results found
            </h2>
            <p className="mt-2 text-gray-600 leading-relaxed dark:text-gray-400">
              Nothing came back for{" "}
              <span className="font-mono text-gray-800 break-words dark:text-gray-200">
                {urlQuery}
              </span>
              . Try rephrasing, using simpler terms, or checking the
              AI-translated query above — Study Hub{" "}
              <span className="font-semibold">ranks, never filters</span>, so
              if PubMed has no hits for this query, nothing is hidden.
            </p>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Or try one of these:
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex.query}
                  type="button"
                  onClick={() => handleExampleSearch(ex.query)}
                  className="inline-flex items-center gap-1.5 border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-blue-100 hover:border-blue-300 transition-colors dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40 dark:hover:border-blue-800"
                >
                  {ex.label} →
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Grid — Task 20: each card is the shared <StudyCard>, which
            applies a distinct "Visited" treatment for PMIDs the user has
            already clicked. */}
        <div className="flex flex-col gap-6">
          {results.map((study) => (
            <StudyCard key={study.pmid} {...study} />
          ))}
        </div>

        {/* Task 17 — Load More / pagination control */}
        {results.length > 0 && (
          <div className="mt-8 text-center">
            {hasMore ? (
              <>
                <button
                  onClick={loadMore}
                  disabled={loadingMore || loading}
                  className="bg-white border-2 border-blue-600 text-blue-700 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {loadingMore ? "Loading more results..." : "Load more"}
                </button>
                {loadingMore && (
                  <p className="mt-2 text-xs text-gray-500">
                    Fetching the next page and appending it to your results…
                  </p>
                )}
                {loadMoreError && (
                  <p className="mt-2 text-sm text-red-600">{loadMoreError}</p>
                )}
                {totalResults !== null && (
                  <p className="mt-2 text-xs text-gray-500">
                    Showing {results.length} of {totalResults} results
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                You've reached the end of the results
                {totalResults !== null && (
                  <> — all {totalResults} studies are shown above</>
                )}
                .
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}