import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { translateToPubMedQuery } from "@/lib/ai";
import { searchPubMed } from "@/lib/pubmed";

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
 * Body (JSON):
 *   { "question": "how many times a week should I train?", "retmax": 10 }
 *
 * Response:
 *   {
 *     "data": PubMedStudy[],
 *     "translated": true,
 *     "translatedQuery": "(training frequency[tiab]) AND (resistance training[Mesh])",
 *     "explanation": "..." | null,
 *     "originalTerm": "how many times a week should I train?"
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, retmax } = body as {
      question?: string;
      retmax?: number;
    };

    const term = question?.trim();
    if (!term) {
      return NextResponse.json(
        { error: "Missing question in request body" },
        { status: 400 }
      );
    }

    const limit = Math.min(Math.max(retmax ?? 10, 1), 50);

    // Step 1: try the AI translation (server-side; DeepSeek key here only).
    try {
      const { query, explanation } = await translateToPubMedQuery(term);
      const data = await searchPubMed(query, limit);
      return NextResponse.json({
        data,
        translated: true,
        translatedQuery: query,
        explanation,
        originalTerm: term,
      });
    } catch (translationError) {
      // Fallback: existing term search. The UI still gets a transparent
      // disclosure showing that the raw term was used.
      console.error(
        "AI query translation failed, falling back to raw term search:",
        translationError
      );
      const data = await searchPubMed(term, limit);
      return NextResponse.json({
        data,
        translated: false,
        translatedQuery: term,
        explanation: null,
        originalTerm: term,
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