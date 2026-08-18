import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { PubMedStudy } from "@/lib/pubmed";
import type { StudySimplification } from "@/lib/ai";

/**
 * POST /api/save-simplification
 *
 * Persists a validated StudySimplification into the regenerable
 * `study_simplifications` table (1:1 with a study, keyed by `study_id`
 * resolved from `studies.pmid`).
 *
 * Security model (mirrors /api/save-context — shared REGENERABLE derived
 * library): study_simplifications RLS = SELECT + INSERT + UPDATE (upsert on
 * study_id = regenerate; DELETE stays locked). The `studies` row is created
 * INSERT-only if missing, exactly mirroring the save-study / save-context
 * check-then-insert philosophy.
 *
 * Body (JSON):
 *   {
 *     "study": PubMedStudy,           // ensures the studies row exists
 *     "simplification": StudySimplification, // validated output of /api/simplify-study
 *     "sourceInfo": "full_text" | "abstract_only" | "provided_text"
 *   }
 *
 * Response: { success: true, studyId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { study, simplification, sourceInfo } = body as {
      study?: PubMedStudy;
      simplification?: StudySimplification;
      sourceInfo?: "full_text" | "abstract_only" | "provided_text";
    };

    if (!study?.pmid || !simplification?.simplified_text) {
      return NextResponse.json(
        { error: "Missing study and simplification in request body" },
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
      // INSERT-only, mirroring save-study/save-context. Capture the row
      // (incl. id) from the insert response so we don't need a follow-up select.
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

    // 2) Upsert the regenerable simplification row (UPDATE + INSERT allowed by RLS).
    const { error: upsertError } = await supabase.from("study_simplifications").upsert(
      {
        study_id: studyId,
        simplified_text: simplification.simplified_text,
        source_info: sourceInfo ?? "provided_text",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "study_id" }
    );

    if (upsertError) {
      console.error("Supabase upsert simplification failed:", upsertError);
      return NextResponse.json(
        { error: "Failed to save study simplification" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, studyId });
  } catch (err) {
    console.error("save-simplification error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save simplification" },
      { status: 500 }
    );
  }
}