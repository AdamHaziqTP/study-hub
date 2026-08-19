"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Task 21 — Quick-save bookmark state.
 *
 * A client hook that knows which study PMIDs are already saved in the shared
 * `studies` library, so the StudyCard bookmark can reflect already-saved state.
 * The `studies` table is the single source of truth (the "Library"), so there's
 * no localStorage here — we just read the saved PMIDs (RLS allows public SELECT).
 *
 * A module-level shared fetch means all cards on a page share ONE query instead
 * of each firing its own, and `markSaved` optimistically updates the set after
 * a successful `/api/save-study` POST.
 *
 * Hydration safety: the set starts empty on server + first client render and
 * is populated in a mount `useEffect` (`loaded` flips true), so a saved-state
 * icon never causes an SSR/hydration mismatch — consumers gate on `loaded`.
 */
let savedCache: Set<string> | null = null;
let sharedFetch: Promise<Set<string>> | null = null;

async function loadSaved(): Promise<Set<string>> {
  if (savedCache) return savedCache;
  if (!sharedFetch) {
    sharedFetch = (async () => {
      const client = createClient();
      const { data, error } = await client.from("studies").select("pmid");
      const next = new Set((data ?? []).map((r) => r.pmid));
      if (!error) savedCache = next;
      return next;
    })();
    sharedFetch.finally(() => {
      sharedFetch = null;
    });
  }
  return sharedFetch;
}

export function useSavedStudies() {
  const [saved, setSaved] = useState<Set<string>>(() => new Set(savedCache ?? []));
  const [loaded, setLoaded] = useState(savedCache !== null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    void loadSaved().then((next) => {
      if (cancelled) return;
      setSaved(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Optimistically record a study as saved after a successful save. */
  const markSaved = useCallback((pmid: string) => {
    setSaved((prev) => {
      if (prev.has(pmid)) return prev;
      const next = new Set(prev);
      next.add(pmid);
      savedCache = next;
      return next;
    });
  }, []);

  return { saved, loaded, markSaved };
}
