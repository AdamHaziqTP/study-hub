import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NextResponseValue } from "next/server";
import { fetchPubMedStudyById } from "@/lib/pubmed";
import { extractStudyContext } from "@/lib/ai";

/**
 * POST /api/extract-context
 *
 * Phase 9 test endpoint: runs Job-1 extraction (no DB write).
 *
 * Body (JSON):
 *   { "pmid": "35819335" }                        -> fetches from PubMed, extracts
 *   { "title": "...", "abstract": "..." }          -> extracts directly from provided text
 *
 * Response: { study, context }
 *   - study   = the raw PubMedStudy (source, unmodified)
 *   - context = validated StudyContext from DeepSeek
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { pmid, title, abstract } = body as {
      pmid?: string;
      title?: string;
      abstract?: string;
    };

    let studyTitle = title;
    let studyAbstract = abstract;

    if (pmid) {
      const fetched = await fetchPubMedStudyById(pmid.trim());
      if (!fetched) {
        return NextResponseValue.json(
          { error: "Study not found in PubMed" },
          { status: 404 }
        );
      }
      studyTitle = fetched.title;
      studyAbstract = fetched.abstract;
    }

    if (!studyTitle || !studyAbstract) {
      return NextResponseValue.json(
        { error: "Provide either a valid pmid, or both title and abstract" },
        { status: 400 }
      );
    }

    const context = await extractStudyContext({
      title: studyTitle,
      abstract: studyAbstract,
    });

    return NextResponseValue.json({ study: pmid ? await fetchPubMedStudyById(pmid.trim()) : null, context });
  } catch (err) {
    console.error("extract-context error:", err);
    return NextResponseValue.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}