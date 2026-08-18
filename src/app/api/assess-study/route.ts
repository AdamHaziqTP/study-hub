import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchPubMedStudyById, fetchFullText } from "@/lib/pubmed";
import { assessStudy } from "@/lib/ai";

/**
 * POST /api/assess-study
 *
 * Job 3 ("Translate cautiously"): generates the qualitative evidence profile
 * for a study — plain-language "why each factor matters" (design, sample size,
 * population, training status, duration, measurement) with NO credibility
 * score, PLUS clearly-labelled "what this might mean for training" with
 * explicit "what this does NOT mean" cautions. Mirrors /api/extract-context
 * and /api/simplify-study — no DB write.
 *
 * Body (JSON):
 *   { "pmid": "35819335" }               -> fetches from PubMed (+ PMC full text when available), assesses
 *   { "title": "...", "abstract": "..." } -> assesses directly from provided text (abstract-only)
 *
 * Response: { study, assessment, sourceInfo }
 *   - study      = the raw PubMedStudy (source, unmodified)
 *   - assessment = validated StudyAssessment from DeepSeek
 *   - sourceInfo = which text was used: "full_text" | "abstract_only" | "provided_text"
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

    const assessment = await assessStudy({
      title: studyTitle,
      abstract: studyAbstract,
      fullText,
    });

    const study = pmid ? await fetchPubMedStudyById(pmid.trim()) : null;

    return NextResponse.json({ study, assessment, sourceInfo });
  } catch (err) {
    console.error("assess-study error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Assessment failed" },
      { status: 500 }
    );
  }
}