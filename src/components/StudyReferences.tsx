"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_LABELS,
  type EvidenceRelationship,
} from "@/lib/articles";

/**
 * StudyReferences - shows which of the signed-in user's claims reference this
 * study, each tagged with its supports/contradicts/mixed/contextual
 * relationship and a link back to the article for editing.
 *
 * Query shape (articles -> claims -> evidence_links), all under the signed-in
 * user's auth session so the PRIVATE RLS policies only return THEIR rows:
 *   articles(id, title)
 *   claims(id, text, articles(id, title))
 *   evidence_links(relationship, claims(...)) filtered by study_id
 */
export default function StudyReferences({ studyId }: { studyId: string }) {
  const [rows, setRows] = useState<
    {
      relationship: EvidenceRelationship;
      claimText: string;
      claimId: string;
      articleId: string;
      articleTitle: string;
    }[]
  >([]);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/browser");
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        if (cancelled) return;

        if (!authData.user) {
          setLoggedIn(false);
          setLoading(false);
          return;
        }
        setLoggedIn(true);

        const { data, error: loadError } = await supabase
          .from("evidence_links")
          .select(
            "relationship, claims!inner(id, text, articles!inner(id, title))"
          )
          .eq("study_id", studyId);

        if (cancelled) return;
        if (loadError) {
          console.error("StudyReferences load failed:", loadError);
          setError("Failed to load references");
          setLoading(false);
          return;
        }

        const mapped = (data ?? []).map((link) => {
          const claim = link.claims as unknown as {
            id: string;
            text: string;
            articles: { id: string; title: string };
          };
          return {
            relationship: link.relationship as EvidenceRelationship,
            claimText: claim.text,
            claimId: claim.id,
            articleId: claim.articles.id,
            articleTitle: claim.articles.title,
          };
        });

        setRows(mapped);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("StudyReferences failed:", err);
          setError("Failed to load references");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studyId]);

  if (loading) {
    return (
      <div className="p-5 rounded-xl border border-gray-200 bg-white animate-pulse dark:border-gray-700 dark:bg-gray-900">
        <div className="h-3 w-40 bg-gray-200 rounded mb-3" />
        <div className="h-3 w-full bg-gray-100 rounded mb-1.5" />
        <div className="h-3 w-4/5 bg-gray-100 rounded" />
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="p-5 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">References in your articles:</span>{" "}
          log in to see which of your claims cite this study.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-5 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No claims in your articles reference this study yet.{" "}
          <Link href="/articles" className="text-blue-600 hover:text-blue-800 font-medium dark:text-blue-400 dark:hover:text-blue-300">
            Write an article
          </Link>{" "}
          and link this study to a claim.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 dark:text-gray-300">
        Referenced in your articles ({rows.length})
      </h3>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div
            key={`${row.claimId}-${i}`}
            className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-gray-800 flex-1 dark:text-gray-200">"{row.claimText}"</p>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${RELATIONSHIP_COLORS[row.relationship]}`}
              >
                {RELATIONSHIP_LABELS[row.relationship]}
              </span>
            </div>
            <div className="mt-2">
              <Link
                href={`/articles/${row.articleId}`}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium dark:text-blue-400 dark:hover:text-blue-300"
              >
                From: {row.articleTitle} →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}