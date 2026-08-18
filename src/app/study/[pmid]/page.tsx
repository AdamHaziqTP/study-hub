import { supabase } from "@/lib/supabase";
import { fetchPubMedStudyById, type PubMedStudy } from "@/lib/pubmed";
import { notFound } from "next/navigation";
import StudyDetail from "./StudyDetail";
import type { StudyContext } from "@/lib/ai";

interface PageProps {
  params: Promise<{ pmid: string }>;
}

/**
 * Study detail page - the CORE of the Explorer journey.
 *
 * Flow:
 *   1. Try the saved copy in Supabase first (works even if NCBI is down),
 *      and load any previously-generated `study_context` + identified
 *      limitations from the DB - no AI call needed on revisit.
 *   2. Fall back to a live PubMed fetch (no saved context to show yet).
 *
 * The page is force-dynamic: whether a study is saved (and thus whether
 * PersonalNotes receives a studyId) changes as users save studies to the
 * shared library.
 *
 * Next.js 16: `params` is a Promise and must be awaited.
 */
export const dynamic = "force-dynamic";

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

    // Load any previously-generated context from the DB (DB-first, regenerable).
    const { data: contextRow } = await supabase
      .from("study_context")
      .select("*")
      .eq("study_id", saved.id)
      .maybeSingle();

    let savedContext: StudyContext | null = null;
    let savedSourceInfo: string | null = null;

    if (contextRow) {
      const { data: limitationRows } = await supabase
        .from("study_identified_limitations")
        .select("limitation, based_on")
        .eq("study_id", saved.id)
        .order("sort_order", { ascending: true });

      savedContext = {
        research_question: contextRow.research_question,
        study_design: contextRow.study_design,
        sample_size: contextRow.sample_size,
        population: contextRow.population,
        training_status: contextRow.training_status,
        duration: contextRow.duration,
        intervention: contextRow.intervention,
        control: contextRow.control,
        outcomes: contextRow.outcomes,
        findings: contextRow.findings,
        limitations: contextRow.limitations,
        identified_limitations: limitationRows ?? [],
      };
      savedSourceInfo = contextRow.source_info ?? null;
    }

    return (
      <StudyDetail
        study={study}
        source="saved"
        studyId={saved.id}
        savedContext={savedContext}
        savedSourceInfo={savedSourceInfo}
      />
    );
  }

  // 2) Fall back to a live fetch from NCBI
  const study = await fetchPubMedStudyById(pmid).catch(() => null);

  if (!study) {
    notFound();
  }

  return <StudyDetail study={study} source="live" />;
}