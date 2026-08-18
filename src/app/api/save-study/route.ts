import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { PubMedStudy } from "@/lib/pubmed";

/**
 * POST /api/save-study
 *
 * Saves a PubMed study into the shared `studies` library.
 *
 * Security model (matches the SELECT + INSERT RLS policies only):
 *   - The public/anon key can READ and INSERT, but NOT UPDATE.
 *   - The raw PubMed record is source-derived; arbitrary public users
 *     must not be able to modify existing cached studies.
 *   - If the PMID already exists, this endpoint returns a no-op "already
 *     present" success instead of trying to overwrite it.
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

    // 1) Check whether this study is already cached.
    const { data: existing, error: checkError } = await supabase
      .from("studies")
      .select("pmid")
      .eq("pmid", body.pmid)
      .maybeSingle();

    if (checkError) {
      console.error("Supabase check failed:", checkError);
      return NextResponse.json(
        { error: "Failed to check study" },
        { status: 500 }
      );
    }

    if (existing) {
      // Already saved. No-op success — do not overwrite the source record.
      return NextResponse.json({ success: true, alreadyPresent: true, pmid: body.pmid });
    }

    // 2) Insert only. The public anon key has INSERT but not UPDATE.
    const { error: insertError } = await supabase.from("studies").insert({
      pmid: body.pmid,
      title: body.title ?? "No title available",
      abstract: body.abstract ?? null,
      authors: body.authors ?? null,
      journal: body.journal ?? null,
      publication_date: body.publicationDate ?? null,
    });

    if (insertError) {
      console.error("Supabase insert failed:", insertError);
      return NextResponse.json(
        { error: "Failed to save study" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, alreadyPresent: false, pmid: body.pmid });
  } catch (err) {
    console.error("save-study error:", err);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}