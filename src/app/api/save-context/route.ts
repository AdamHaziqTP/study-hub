import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { PubMedStudy } from "@/lib/pubmed";
import type { StudyContext } from "@/lib/ai";

/**
 * POST /api/save-context
 *
 * Persists a validated StudyContext into the regenerable `study_context`
 * table (1:1 with a study, keyed by `study_id` resolved from `studies.pmid`),
 * plus its derived `identified_limitations` rows.
 *
 * Security model (shared REGENERABLE derived library, unlike the immutable
 * `studies` source):
 *   - study_context RLS = SELECT + INSERT + UPDATE  (upsert on study_id =
 *     regenerate; DELETE stays locked — a full-row upsert replaces content).
 *   - study_identified_limitations RLS = SELECT + INSERT + DELETE  (regenerate
 *     = delete-all + reinsert; no UPDATE — each row is replaced wholesale).
 *   - The `studies` row is created INSERT-only if missing, exactly mirroring
 *     /api/save-study's check-then-insert philosophy.
 *
 * Body (JSON):
 *   {
 *     "study": PubMedStudy,          // ensures the studies row exists
 *     "context": StudyContext,       // validated output of /api/extract-context
 *     "sourceInfo": "full_text" | "abstract_only" | "provided_text"
 *   }
 *
 * Response: { success: true, studyId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { study, context, sourceInfo } = body as {
      study?: PubMedStudy;
      context?: StudyContext;
      sourceInfo?: "full_text" | "abstract_only" | "provided_text";
    };

    if (!study?.pmid || !context) {
      return NextResponse.json(
        { error: "Missing study and context in request body" },
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
      // INSERT-only, mirroring save-study. Capture the row (incl. id) from
      // the insert response so we don't need a follow-up select.
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

    // 2) Upsert the regenerable context row (UPDATE + INSERT allowed by RLS).
    const { error: upsertError } = await supabase.from("study_context").upsert(
      {
        study_id: studyId,
        research_question: context.research_question,
        study_design: context.study_design,
        sample_size: context.sample_size,
        population: context.population,
        training_status: context.training_status,
        duration: context.duration,
        intervention: context.intervention,
        control: context.control,
        outcomes: context.outcomes,
        findings: context.findings,
        limitations: context.limitations,
        source_info: sourceInfo ?? "provided_text",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "study_id" }
    );

    if (upsertError) {
      console.error("Supabase upsert context failed:", upsertError);
      return NextResponse.json(
        { error: "Failed to save study context" },
        { status: 500 }
      );
    }

    // 3) Replace identified limitations wholesale (delete-all + reinsert).
    const { error: deleteError } = await supabase
      .from("study_identified_limitations")
      .delete()
      .eq("study_id", studyId);

    if (deleteError) {
      console.error("Supabase delete limitations failed:", deleteError);
      return NextResponse.json(
        { error: "Failed to replace identified limitations" },
        { status: 500 }
      );
    }

    const limitationRows = (context.identified_limitations ?? []).map(
      (item, index) => ({
        study_id: studyId,
        limitation: item.limitation,
        based_on: item.based_on,
        sort_order: index,
      })
    );

    if (limitationRows.length > 0) {
      const { error: insertLimError } = await supabase
        .from("study_identified_limitations")
        .insert(limitationRows);

      if (insertLimError) {
        console.error("Supabase insert limitations failed:", insertLimError);
        return NextResponse.json(
          { error: "Failed to save identified limitations" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, studyId });
  } catch (err) {
    console.error("save-context error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save context" },
      { status: 500 }
    );
  }
}