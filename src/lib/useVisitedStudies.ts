"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Task 20 — Visited-links indicator.
 *
 * A small client-only hook that tracks which study PMIDs the user has already
 * clicked/visited, persisted in `localStorage` so the "visited" marker survives
 * navigation, refreshes, and even page reloads (not just the current session).
 *
 * Hydration safety: `localStorage` only exists in the browser, so the visited
 * set starts EMPTY on both the server render and the first client render
 * (avoiding an SSR/hydration mismatch). `hydrated` flips to true in a
 * `useEffect` after mount and only then is the persisted set applied, so the
 * visited styling appears purely client-side with no flash-of-false-visited on
 * the server HTML. Consumers should gate the visited styling on `hydrated`.
 */
const STORAGE_KEY = "study-hub:visited-pmids";

/** Read + parse the persisted visited-PMID list (safe against corrupt JSON). */
function readVisited(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function useVisitedStudies() {
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVisited(readVisited());
    setHydrated(true);
  }, []);

  /** Record a study as visited (idempotent) and persist it. */
  const markVisited = useCallback((pmid: string) => {
    setVisited((prev) => {
      if (prev.has(pmid)) return prev;
      const next = new Set(prev);
      next.add(pmid);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Storage unavailable (private mode / quota) — degrade to in-memory only.
      }
      return next;
    });
  }, []);

  return { visited, hydrated, markVisited };
}
