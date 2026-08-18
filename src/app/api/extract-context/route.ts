import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchPubMedStudyById, fetchFullText } from "@/lib/pubmed";
import { extractStudyContext } from "@/lib/ai";

/**
 * POST /api/extract-context
 *
 * Phase 9 test endpoint: runs extraction (no DB write).
 *
 * Body (JSON):
 *   { "pmid": "35819335" }               -> fetches from PubMed (+ PMC full text when available), extracts
 *   { "title": "...", "abstract": "..." } -> extracts directly from provided text (abstract-only)
 *
 * Response: { study, context, sourceInfo }
 *   - study       = the raw PubMedStudy (source, unmodified)
 *   - context     = validated StudyContext from DeepSeek
 *   - sourceInfo  = which text was used: "full_text" | "abstract_only" | "provided_text"
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pmid, title, abstract } = body as {
      pmid?: string;
      title?: string;
      abstract?: string;
    };

    let studyTitle = title;
    let studyAbstract = abstract;
    let fullText: string | null = null;
    let sourceInfo: "full_text" | "abstract_only" | "provided_text" = "provided_text";

    if (pmid) {
      const fetched = await fetchPubMedStudyById(pmid.trim());
      if (!fetched) {
        return NextResponse.json(
          { error: "Study not found in PubMed" },
          { status: 404 }
        );
      }
      studyTitle = fetched.title;
      studyAbstract = fetched.abstract;
      sourceInfo = "abstract_only";

      // Try PMC full text (open-access articles); fall back to abstract if unavailable.
      const fullTextResult = await fetchFullText(pmid.trim());
      if (fullTextResult.text) {
        fullText = fullTextResult.text;
        sourceInfo = "full_text";
      }
    }

    if (!studyTitle || !studyAbstract) {
      return NextResponse.json(
        { error: "Provide either a valid pmid, or both title and abstract" },
        { status: 400 }
      );
    }

    const context = await extractStudyContext({
      title: studyTitle,
      abstract: studyAbstract,
      fullText,
    });

    // Fetch the study once (skip re-fetch when full text was used and we already have it)
    const study = pmid ? await fetchPubMedStudyById(pmid.trim()) : null;

    return NextResponse.json({ study, context, sourceInfo });
  } catch (err) {
    console.error("extract-context error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}