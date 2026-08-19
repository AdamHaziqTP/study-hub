import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { translateToPubMedQuery } from "@/lib/ai";
import { searchPubMedPage } from "@/lib/pubmed";

/**
 * POST /api/ai-search
 *
 * Task 15 — Smart AI-Assisted Search.
 *
 * Endpoint flow (all server-side, DeepSeek key never leaves the server):
 *   1. Take a natural, layman question (e.g. "how many times a week should
 *      I train?") from the request body.
 *   2. Send it to DeepSeek (Job 4, `translateToPubMedQuery` in `src/lib/ai.ts`
 *      — SAME cheap fast model as every other job) to translate it into an
 *      optimized PubMed query (title/abstract keywords, MeSH-ish terms,
 *      boolean operators).
 *   3. Fetch the most relevant studies with the EXISTING `searchPubMed` flow
 *      (NCBI Best Match, relevance-ranked — "rank, don't filter").
 *
 * Fallback: if the AI translation fails for any reason (missing key, API
 * error, invalid JSON), the endpoint falls back to the RAW user term through
 * the same `searchPubMed` flow, so the existing term search always works.
 * The response always includes a `translated` flag + the generated PubMed
 * query (or the raw term when the fallback was used) so the UI can show a
 * visible "AI-translated query" disclosure telling the user exactly what was
 * actually searched.
 *
 * Task 17 — Pagination / Load More: the body also accepts `retmax` + `retstart`,
 * and the client REUSES the already-translated query for page 2+ by sending
 * it back as `translatedQuery` (with `translated` + `explanation`). When
 * `translatedQuery` is present the endpoint SKIPS DeepSeek entirely and
 * directly offsets into the same ranked list — the AI is never re-run deep in
 * the results. `totalResults` is returned so the UI knows when to stop.
 *
 * Body (JSON):
 *   { "question": "...", "retmax": 10, "retstart": 0 }
 *   // page 2+ (same question + reused translated query):
 *   { "question": "...", "translatedQuery": "(training frequency[tiab])...",
 *     "translated": true, "explanation": "...", "retmax": 10, "retstart": 10 }
 *
 * Response:
 *   {
 *     "data": PubMedStudy[],
 *     "translated": true,
 *     "translatedQuery": "(training frequency[tiab]) AND (resistance training[Mesh])",
 *     "explanation": "..." | null,
 *     "originalTerm": "how many times a week should I train?",
 *     "totalResults": 238
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      question,
      retmax,
      retstart,
      translatedQuery,
      translated,
      explanation,
    } = body as {
      question?: string;
      retmax?: number;
      retstart?: number;
      /** Already-translated PubMed query from the first page (reused, never re-translated). */
      translatedQuery?: string;
      translated?: boolean;
      explanation?: string | null;
    };

    const term = question?.trim();
    if (!term) {
      return NextResponse.json(
        { error: "Missing question in request body" },
        { status: 400 }
      );
    }

    const limit = Math.min(Math.max(retmax ?? 10, 1), 50);
    const offset = Math.max(retstart ?? 0, 0);

    // Run a page against a concrete PubMed query and shape the response.
    const runPage = async (query: string) => {
      const page = await searchPubMedPage(query, limit, offset);
      return NextResponse.json({
        data: page.data,
        translated: translated ?? !!translatedQuery,
        translatedQuery: query,
        explanation: explanation ?? null,
        originalTerm: term,
        totalResults: page.totalResults,
      });
    };

    // Task 17 — page 2+: the client sends back the query it already translated
    // on page 1. Reuse it DIRECTLY (skip DeepSeek entirely) and offset into the
    // same ranked list. This guarantees "never re-translate deep in the list".
    if (translatedQuery && translatedQuery.trim()) {
      const data = await runPage(translatedQuery.trim());
      return data;
    }

    // Step 1: try the AI translation (server-side; DeepSeek key here only).
    try {
      const { query, explanation: freshExplanation } = await translateToPubMedQuery(term);
      const page = await searchPubMedPage(query, limit, offset);
      return NextResponse.json({
        data: page.data,
        translated: true,
        translatedQuery: query,
        explanation: freshExplanation,
        originalTerm: term,
        totalResults: page.totalResults,
      });
    } catch (translationError) {
      // Fallback: existing term search. The UI still gets a transparent
      // disclosure showing that the raw term was used.
      console.error(
        "AI query translation failed, falling back to raw term search:",
        translationError
      );
      const page = await searchPubMedPage(term, limit, offset);
      return NextResponse.json({
        data: page.data,
        translated: false,
        translatedQuery: term,
        explanation: null,
        originalTerm: term,
        totalResults: page.totalResults,
      });
    }
  } catch (error) {
    console.error("ai-search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI search failed" },
      { status: 500 }
    );
  }
}
