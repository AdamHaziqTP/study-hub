import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { PubMedStudy } from "@/lib/pubmed";
import type { StudyAssessment } from "@/lib/ai";

/**
 * POST /api/save-assessment
 *
 * Persists a validated StudyAssessment into the regenerable `study_assessments`
 * table (1:1 with a study, keyed by `study_id` resolved from `studies.pmid`).
 *
 * Security model (mirrors /api/save-context and /api/save-simplification —
 * shared REGENERABLE derived library): study_assessments RLS =
 * SELECT + INSERT + UPDATE (upsert on study_id = regenerate; DELETE stays
 * locked). The `studies` row is created INSERT-only if missing, mirroring the
 * save-study / save-context / save-simplification check-then-insert philosophy.
 *
 * Body (JSON):
 *   {
 *     "study": PubMedStudy,             // ensures the studies row exists
 *     "assessment": StudyAssessment,    // validated output of /api/assess-study
 *     "sourceInfo": "full_text" | "abstract_only" | "provided_text"
 *   }
 *
 * Response: { success: true, studyId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { study, assessment, sourceInfo } = body as {
      study?: PubMedStudy;
      assessment?: StudyAssessment;
      sourceInfo?: "full_text" | "abstract_only" | "provided_text";
    };

    if (!study?.pmid || !assessment) {
      return NextResponse.json(
        { error: "Missing study and assessment in request body" },
        { status: 400 }
      );
    }

    // 1) Ensure the studies row exists (INSERT-only, mirroring save-study).
    let { data: studyRow, error: checkError } = await supabase
      .from("studies")
      .select("id, pmid")
      .eq("pmid", study.pmid)
      .maybeSingle();

    if (checkError) {
      console.error("Supabase check failed:", checkError);
      return NextResponse.json(
        { error: "Failed to check study" },
        { status: 500 }
      );
    }

    if (!studyRow) {
      // INSERT-only, mirroring save-study/save-context/save-simplification.
      // Capture the row (incl. id) from the insert response so we don't need
      // a follow-up select.
      const { data: inserted, error: insertError } = await supabase
        .from("studies")
        .insert({
          pmid: study.pmid,
          title: study.title ?? "No title available",
          abstract: study.abstract ?? null,
          authors: study.authors ?? null,
          journal: study.journal ?? null,
          publication_date: study.publicationDate ?? null,
        })
        .select("id, pmid")
        .maybeSingle();

      if (insertError) {
        console.error("Supabase insert study failed:", insertError);
        return NextResponse.json(
          { error: "Failed to save study" },
          { status: 500 }
        );
      }

      if (!inserted) {
        return NextResponse.json(
          { error: "Failed to resolve study after insert" },
          { status: 500 }
        );
      }
      studyRow = inserted;
    }

    const studyId = studyRow.id;

    // 2) Upsert the regenerable assessment row (UPDATE + INSERT allowed by RLS).
    const { error: upsertError } = await supabase.from("study_assessments").upsert(
      {
        study_id: studyId,
        design_context: assessment.design_context,
        sample_size_context: assessment.sample_size_context,
        population_context: assessment.population_context,
        training_status_context: assessment.training_status_context,
        duration_context: assessment.duration_context,
        measurement_context: assessment.measurement_context,
        training_application: assessment.training_application,
        training_cautions: assessment.training_cautions,
        source_info: sourceInfo ?? "provided_text",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "study_id" }
    );

    if (upsertError) {
      console.error("Supabase upsert assessment failed:", upsertError);
      return NextResponse.json(
        { error: "Failed to save study assessment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, studyId });
  } catch (err) {
    console.error("save-assessment error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save assessment" },
      { status: 500 }
    );
  }
}