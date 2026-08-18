import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { assessClaimAlignment } from "@/lib/ai";

/**
 * POST /api/assess-claim
 *
 * Claim alignment check (Job 3b, the "no confirmation-bias machine" guard):
 * judges whether a user's claim text ACCURATELY represents the studies it is
 * linked to. Uses the SAME cheap fast model as every other AI job
 * (DEEPSEEK_MODEL env override, default "deepseek-chat") — there is
 * deliberately no separate heavier-model logic.
 *
 * Body (JSON):
 *   {
 *     "claimText": "Overhead triceps extensions produce greater long-head hypertrophy...",
 *     "studyIds": ["<studies.uuid>", ...]   // studies the claim links to
 *   }
 *
 * The endpoint resolves each study's abstract from the shared `studies`
 * table (public read) and its AI-extracted `findings` from the regenerable
 * `study_context` table when available, then runs the alignment check.
 *
 * Response: { verdict: "aligned" | "partially_aligned" | "unaligned", reasoning }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimText, studyIds } = body as {
      claimText?: string;
      studyIds?: string[];
    };

    if (!claimText || claimText.trim() === "") {
      return NextResponse.json(
        { error: "Missing claimText in request body" },
        { status: 400 }
      );
    }
    if (!Array.isArray(studyIds) || studyIds.length === 0) {
      return NextResponse.json(
        { error: "Missing studyIds — a claim needs at least one linked study" },
        { status: 400 }
      );
    }

    // Resolve the linked studies' abstracts from the shared library.
    const { data: studyRows, error: studiesError } = await supabase
      .from("studies")
      .select("id, pmid, title, abstract")
      .in("id", studyIds);

    if (studiesError) {
      console.error("Supabase load studies failed:", studiesError);
      return NextResponse.json(
        { error: "Failed to load linked studies" },
        { status: 500 }
      );
    }

    if (!studyRows || studyRows.length === 0) {
      return NextResponse.json(
        { error: "No linked studies found in the library" },
        { status: 404 }
      );
    }

    // Load AI-extracted findings for each study (regenerable warehouse, optional).
    const { data: contextRows, error: contextError } = await supabase
      .from("study_context")
      .select("study_id, findings")
      .in(
        "study_id",
        studyRows.map((s) => s.id)
      );

    if (contextError) {
      console.error("Supabase load context failed:", contextError);
      return NextResponse.json(
        { error: "Failed to load study findings" },
        { status: 500 }
      );
    }

    const findingsByStudyId = new Map<string, string | null>(
      (contextRows ?? []).map((row) => [row.study_id, row.findings])
    );

    const studies = studyRows
      .filter((s) => s.abstract && s.abstract.trim() !== "")
      .map((s) => ({
        pmid: s.pmid,
        title: s.title,
        abstract: s.abstract,
        findings: findingsByStudyId.get(s.id) ?? null,
      }));

    if (studies.length === 0) {
      return NextResponse.json(
        { error: "Linked studies have no abstracts to compare against" },
        { status: 400 }
      );
    }

    const result = await assessClaimAlignment({
      claimText: claimText.trim(),
      studies,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("assess-claim error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Claim assessment failed" },
      { status: 500 }
    );
  }
}