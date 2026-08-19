"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

interface ArticleRow {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * ArticlesList - client-side list of the signed-in user's own articles
 * (Task 7). The `articles` table is PRIVATE: RLS locks rows to
 * auth.uid() = user_id, and user_id DEFAULTS to auth.uid() in the DB — the
 * client never sends it.
 *
 * Flow:
 *   1. Unauthenticated -> sign-in CTA (same pattern as PersonalNotes).
 *   2. Authenticated -> load the user's articles newest-first.
 */
export default function ArticlesList() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("articles")
        .select("id, title, content, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (loadError) throw loadError;
      setArticles((data as ArticleRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load articles");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setUserId(data.user?.id ?? null);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setUserId(null);
          setAuthLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname
    )}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo },
    });
    if (signInError) {
      console.error("Sign-in failed:", signInError.message);
      setBusy(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("articles")
        .insert({ title: "Untitled article", content: "" })
        .select("id")
        .single();
      if (insertError) throw insertError;
      // Navigate straight into the editor for the fresh article.
      router.push(`/articles/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create article");
      setBusy(false);
    }
  }, [userId, router]);

  /** Delete an article + its claims + evidence links (RLS-scoped to the owner). */
  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this article and all its claims? This cannot be undone.")) {
        return;
      }
      setDeletingId(id);
      setError(null);
      try {
        const supabase = createClient();
        const { data: claimRows } = await supabase
          .from("claims")
          .select("id")
          .eq("article_id", id);
        const claimIds = (claimRows ?? []).map((c) => c.id as string);
        if (claimIds.length > 0) {
          await supabase.from("evidence_links").delete().in("claim_id", claimIds);
        }
        await supabase.from("claims").delete().eq("article_id", id);
        const { error: delError } = await supabase.from("articles").delete().eq("id", id);
        if (delError) throw delError;
        setArticles((prev) => prev.filter((a) => a.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete article");
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  // ---- Unauthenticated ----
  if (!authLoading && !userId) {
    return (
      <div className="p-12 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 text-center">
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Log in to write articles
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          Articles are your own evidence-backed conclusions. Write a claim, then
          link it to the studies you have discovered in the Explorer — marking
          each as supporting, contradicting, mixed, or contextual.
        </p>
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {busy ? "Redirecting..." : "Sign in with GitHub"}
        </button>
      </div>
    );
  }

  // ---- Auth loading ----
  if (authLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="p-6 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 animate-pulse"
          >
            <div className="h-4 w-1/2 bg-gray-200 rounded mb-3" />
            <div className="h-3 w-3/4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // ---- Signed in ----
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
          {articles.length} {articles.length === 1 ? "article" : "articles"}
        </p>
        <button
          onClick={handleCreate}
          disabled={busy || loading}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {busy ? "Creating..." : "New article"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-6 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 animate-pulse"
            >
              <div className="h-4 w-1/2 bg-gray-200 rounded mb-3" />
              <div className="h-3 w-3/4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 rounded-xl p-12 text-center">
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No articles yet
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-6">
            Write your first evidence-backed conclusion. Start by saving a few
            studies to your library, then create an article that cites them.
          </p>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Create your first article
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {articles.map((article) => (
            <div
              key={article.id}
              className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <Link href={`/articles/${article.id}/read`}>
                <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100 leading-snug hover:text-blue-700 transition-colors">
                  {article.title}
                </h2>
              </Link>
              {article.content ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mb-3 leading-relaxed">
                  {article.content}
                </p>
              ) : (
                <p className="text-gray-400 dark:text-gray-500 text-sm italic mb-3">
                  No content yet
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                Updated{" "}
                {new Date(article.updated_at).toLocaleDateString()} ·{" "}
                {new Date(article.updated_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/articles/${article.id}/read`}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                >
                  Read
                </Link>
                <Link
                  href={`/articles/${article.id}`}
                  className="text-sm font-semibold text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(article.id)}
                  disabled={deletingId === article.id}
                  className="text-sm font-semibold text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                >
                  {deletingId === article.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}