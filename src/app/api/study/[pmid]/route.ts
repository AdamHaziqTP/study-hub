import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchPubMedStudyById } from "@/lib/pubmed";

/**
 * DELETE /api/study/[pmid]
 *
 * Removes a study from the shared `studies` library (Task 14 — "Remove from
 * Library").
 *
 * Phase 2 change to the security model: the `studies` table gained a public
 * DELETE policy + grant so the shared library is manageable. The PubMed source
 * itself is never modified — we only remove the cached copy from the library,
 * and it can be re-saved any time. Note that ON DELETE CASCADE also removes
 * the study's derived AI rows (study_context, study_simplifications,
 * study_assessments — all regenerable) and any study_notes / evidence_links
 * referencing it (see PROJECT_NOTES §12.5 for the one-time schema update).
 *
 * Next.js 16: `params` is a Promise and must be awaited.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pmid: string }> }
) {
  const { pmid } = await params;
  if (!pmid) {
    return NextResponse.json({ error: "Missing pmid" }, { status: 400 });
  }
  const study = await fetchPubMedStudyById(pmid);
  if (!study) {
    return NextResponse.json(
      { error: "Study not found in PubMed" },
      { status: 404 }
    );
  }
  return NextResponse.json({ study });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ pmid: string }> }
) {
  try {
    const { pmid } = await params;

    if (!pmid) {
      return NextResponse.json({ error: "Missing pmid" }, { status: 400 });
    }

    const { data: deleted, error } = await supabase
      .from("studies")
      .delete()
      .eq("pmid", pmid)
      .select("pmid");

    if (error) {
      console.error("Supabase delete failed:", error);
      return NextResponse.json(
        { error: "Failed to remove study" },
        { status: 500 }
      );
    }

    // If no row was deleted it wasn't in the library — still a no-op success.
    return NextResponse.json({
      success: true,
      pmid,
      alreadyAbsent: !deleted || deleted.length === 0,
    });
  } catch (err) {
    console.error("delete-study error:", err);
    return NextResponse.json({ error: "Failed to remove study" }, { status: 500 });
  }
}