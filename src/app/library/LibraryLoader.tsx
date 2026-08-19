"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import StudyCard, { type StudyCardProps } from "@/components/StudyCard";
import LibraryList from "./LibraryList";

/**
 * LibraryLoader — loads the SIGNED-IN user's own saved studies.
 *
 * The Library is now per-account (`user_saved_studies`), so it can't be a
 * public server query. This client component reads the user's saved studies
 * (joined to the public `studies` source registry) via the @supabase/ssr
 * browser client — RLS filters to auth.uid() — and passes them to
 * <LibraryList> for rendering + live removal.
 */
export default function LibraryLoader() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [studies, setStudies] = useState<StudyCardProps[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("user_saved_studies")
        .select(
          "studies(id, pmid, title, authors, journal, publication_date, abstract)"
        )
        .order("created_at", { ascending: false });
      if (loadError) throw loadError;

      const mapped = ((data ?? []) as unknown as Array<{ studies: Record<string, unknown> | null }>)
        .filter((row) => row.studies)
        .map((row) => {
          const s = row.studies!;
          return {
            pmid: s.pmid as string,
            title: s.title as string,
            authors: (s.authors as string) ?? "Unknown Authors",
            journal: (s.journal as string) ?? "Unknown Journal",
            publicationDate: (s.publication_date as string | null) ?? null,
            abstract: (s.abstract as string) ?? "No abstract available",
          };
        });
      setStudies(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load library");
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

  if (!authLoading && !userId) {
    return (
      <div className="p-12 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 text-center">
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Log in to see your Library
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Your Library is private to you — studies you save appear here.
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

  if (authLoading || loading) {
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

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-xl p-6 text-red-700 text-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
        Failed to load your library. Please try again later.
      </div>
    );
  }

  return <LibraryList studies={studies} />;
}
