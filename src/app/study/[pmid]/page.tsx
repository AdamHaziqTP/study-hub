import { supabase } from "@/lib/supabase";
import { fetchPubMedStudyById, type PubMedStudy } from "@/lib/pubmed";
import { notFound } from "next/navigation";
import StudyDetail from "./StudyDetail";

interface PageProps {
  params: Promise<{ pmid: string }>;
}

/**
 * Study detail page — the CORE of the Explorer journey.
 *
 * Flow: try the saved copy in Supabase first (so saved studies work even
 * if NCBI is down), then fall back to a live PubMed fetch.
 *
 * Next.js 16: `params` is a Promise and must be awaited.
 */
export default async function StudyPage({ params }: PageProps) {
  const { pmid } = await params;

  // 1) Try the saved copy first
  const { data: saved, error: dbError } = await supabase
    .from("studies")
    .select("*")
    .eq("pmid", pmid)
    .maybeSingle();

  if (!dbError && saved) {
    const study: PubMedStudy = {
      pmid: saved.pmid,
      title: saved.title,
      authors: saved.authors ?? "Unknown Authors",
      journal: saved.journal ?? "Unknown Journal",
      publicationDate: saved.publication_date
        ? new Date(saved.publication_date).toISOString().slice(0, 10)
        : null,
      abstract: saved.abstract ?? "No abstract available",
    };
    return <StudyDetail study={study} source="saved" />;
  }

  // 2) Fall back to a live fetch from NCBI
  const study = await fetchPubMedStudyById(pmid).catch(() => null);

  if (!study) {
    notFound();
  }

  return <StudyDetail study={study} source="live" />;
}