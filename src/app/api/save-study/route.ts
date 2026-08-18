import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { PubMedStudy } from "@/lib/pubmed";

/**
 * POST /api/save-study
 *
 * Upserts a study into the `studies` table by PMID (idempotent:
 * saving the same study twice won't create a duplicate).
 *
 * Body: a PubMedStudy object (as returned by /api/search-pubmed).
 */
export async function POST(request: NextRequest) {
  try {
    const body: Partial<PubMedStudy> = await request.json();

    if (!body.pmid) {
      return NextResponse.json(
        { error: "Missing pmid in request body" },
        { status: 400 }
      );
    }

    // NOTE: matches the deployed `studies` schema exactly (no doi column yet).
    // If we add a doi column later via migration, add `doi: body.doi ?? null` here.
    const { error } = await supabase.from("studies").upsert(
      {
        pmid: body.pmid,
        title: body.title ?? "No title available",
        abstract: body.abstract ?? null,
        authors: body.authors ?? null,
        journal: body.journal ?? null,
        publication_date: body.publicationDate ?? null,
      },
      { onConflict: "pmid" }
    );

    if (error) {
      console.error("Supabase upsert failed:", error);
      return NextResponse.json(
        { error: "Failed to save study" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, pmid: body.pmid });
  } catch (err) {
    console.error("save-study error:", err);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}