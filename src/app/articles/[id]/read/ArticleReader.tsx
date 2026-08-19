"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthStatus from "@/components/AuthStatus";
import ThemeToggle from "@/components/ThemeToggle";
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_LABELS,
  type EvidenceRelationship,
} from "@/lib/articles";
import { createClient } from "@/lib/supabase/browser";

/**
 * ArticleReader — read-only view of an article (Read action).
 *
 * Loads the article, its claims, and each claim's linked studies (RLS-scoped
 * to the owner), then renders:
 *   1. the full article (title + content),
 *   2. the highlighted claims with their linked studies below — each study is
 *      a clickable link to its study page so a reader can open the evidence.
 *
 * This is the "future-proofed for sharing" surface: no edit controls, just a
 * clean read + evidence list.
 */

interface ReaderStudy {
  id: string;
  pmid: string;
  title: string;
  journal: string | null;
}

interface ReaderClaim {
  id: string;
  text: string;
  links: { id: string; relationship: EvidenceRelationship; study: ReaderStudy }[];
}

type LoadState = "auth" | "loading" | "ready" | "notfound" | "error";

export default function ArticleReader({ articleId }: { articleId: string }) {
  const [loadState, setLoadState] = useState<LoadState>("auth");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [claims, setClaims] = useState<ReaderClaim[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!authData.user) {
          setLoadState("notfound"); // not signed in — treat as private
          return;
        }

        const { data: articleRow, error: articleError } = await supabase
          .from("articles")
          .select("id, title, content")
          .eq("id", articleId)
          .maybeSingle();
        if (cancelled) return;
        if (articleError || !articleRow) {
          setLoadState(articleError ? "error" : "notfound");
          return;
        }
        setTitle(articleRow.title as string);
        setContent((articleRow.content as string) ?? "");

        const { data: claimRows, error: claimError } = await supabase
          .from("claims")
          .select("id, text")
          .eq("article_id", articleId)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        if (claimError) {
          setLoadState("error");
          return;
        }

        const claimIds = (claimRows ?? []).map((c) => c.id as string);
        const { data: linkRows } =
          claimIds.length > 0
            ? await supabase
                .from("evidence_links")
                .select("id, claim_id, relationship, studies(id, pmid, title, journal)")
                .in("claim_id", claimIds)
            : { data: [] as never[] };

        const linksByClaim = new Map<string, ReaderClaim["links"]>();
        for (const row of (linkRows ?? []) as unknown as Array<{
          id: string;
          claim_id: string;
          relationship: EvidenceRelationship;
          studies: ReaderStudy | null;
        }>) {
          if (!row.studies) continue;
          const list = linksByClaim.get(row.claim_id) ?? [];
          list.push({ id: row.id, relationship: row.relationship, study: row.studies });
          linksByClaim.set(row.claim_id, list);
        }

        const loadedClaims: ReaderClaim[] = (claimRows ?? []).map((c) => ({
          id: c.id as string,
          text: c.text as string,
          links: linksByClaim.get(c.id as string) ?? [],
        }));
        setClaims(loadedClaims);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (loadState === "loading" || loadState === "auth") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
        <div className="max-w-3xl mx-auto p-8 space-y-4">
          <div className="h-8 w-1/2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadState === "notfound") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
        <div className="max-w-3xl mx-auto p-8">
          <div className="p-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center">
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Article not found
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This article is private to you (or it no longer exists).
            </p>
            <Link
              href="/articles"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              My Articles →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
        <div className="max-w-3xl mx-auto p-8 text-red-600">
          Failed to load this article.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
      <div className="max-w-3xl mx-auto p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <Link
            href="/articles"
            className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            ← My Articles
          </Link>
          <div className="flex items-center gap-3">
            <AuthStatus />
            <ThemeToggle />
          </div>
        </div>

        <article className="mb-10">
          <h1 className="text-3xl font-bold leading-tight mb-6 dark:text-gray-100">
            {title}
          </h1>
          <div className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line text-base">
            {content || "No content yet."}
          </div>
        </article>

        {/* Claims + their linked studies */}
        <section>
          <h2 className="text-lg font-bold mb-4 pb-2 border-b border-gray-200 dark:border-gray-800">
            Claims &amp; evidence
          </h2>
          {claims.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No claims yet.
            </p>
          ) : (
            <div className="space-y-6">
              {claims.map((claim, i) => (
                <div
                  key={claim.id}
                  className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                    Claim {i + 1}
                  </p>
                  <p className="text-base text-gray-900 dark:text-gray-100 leading-relaxed mb-4">
                    "{claim.text}"
                  </p>
                  {claim.links.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                      No studies linked.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {claim.links.map((link) => (
                        <div
                          key={link.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3"
                        >
                          <Link
                            href={`/study/${link.study.pmid}`}
                            className="min-w-0"
                          >
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-700 dark:hover:text-blue-400 line-clamp-2">
                              {link.study.title}
                            </p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                              PMID: {link.study.pmid}
                            </p>
                          </Link>
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${RELATIONSHIP_COLORS[link.relationship]}`}
                          >
                            {RELATIONSHIP_LABELS[link.relationship]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 text-center">
          <Link
            href={`/articles/${articleId}`}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Edit this article
          </Link>
        </div>
      </div>
    </div>
  );
}
