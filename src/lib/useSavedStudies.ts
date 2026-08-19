"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Per-account saved-studies hook (Task: "saved studies account-linked").
 *
 * The Library is now a private join — `user_saved_studies(user_id, study_id)` —
 * locked by RLS to auth.uid(). This hook loads the signed-in user's saved
 * studies (joined to the public `studies` source registry for PMIDs) and
 * exposes save/remove actions. It is AUTH-GATED: if no user is signed in, the
 * library is empty and `signedIn` is false — saving requires sign-in.
 *
 * Saving by PMID first ensures the public `studies` source row exists via
 * /api/save-study (returns the study id), then inserts into user_saved_studies
 * with the authenticated client (RLS sets user_id from the session).
 */

interface SavedRow {
  study_id: string;
  studies: { pmid: string } | null;
}

export interface SaveableStudy {
  pmid: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  publicationDate: string | null;
}

export function useSavedStudies() {
  const [signedIn, setSignedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedPmids, setSavedPmids] = useState<Set<string>>(new Set());
  const [savedStudyIds, setSavedStudyIds] = useState<Set<string>>(new Set());
  const [studyIdByPmid, setStudyIdByPmid] = useState<Map<string, string>>(
    new Map()
  );
  const startedRef = useRef(false);

  // Load the signed-in user's saved studies once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!authData.user) {
          setSignedIn(false);
          setLoaded(true);
          return;
        }
        setSignedIn(true);

        const { data, error } = await supabase
          .from("user_saved_studies")
          .select("study_id, studies(pmid)")
          .order("created_at", { ascending: false });
        if (cancelled) return;
        if (error) throw error;

        const pmids = new Set<string>();
        const ids = new Set<string>();
        const map = new Map<string, string>();
        for (const row of (data ?? []) as unknown as SavedRow[]) {
          ids.add(row.study_id);
          if (row.studies?.pmid) {
            pmids.add(row.studies.pmid);
            map.set(row.studies.pmid, row.study_id);
          }
        }
        setSavedPmids(pmids);
        setSavedStudyIds(ids);
        setStudyIdByPmid(map);
      } catch {
        // ignore — treat as empty/not loaded
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Save a study to the user's library by its studies.id (auth required). */
  const saveStudyId = useCallback(async (studyId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("user_saved_studies")
      .insert({ study_id: studyId });
    if (error) throw error;
    setSavedStudyIds((prev) => {
      const next = new Set(prev);
      next.add(studyId);
      return next;
    });
  }, []);

  /** Remove a study from the user's library by its studies.id (auth required). */
  const removeStudyId = useCallback(async (studyId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("user_saved_studies")
      .delete()
      .eq("study_id", studyId);
    if (error) throw error;
    setSavedStudyIds((prev) => {
      const next = new Set(prev);
      next.delete(studyId);
      return next;
    });
  }, []);

  /** Save by PMID: ensure the public source row exists, then add to the library. */
  const savePmid = useCallback(
    async (study: SaveableStudy) => {
      const res = await fetch("/api/save-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(study),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save study");
      const studyId = json.studyId as string;
      if (!studyId) throw new Error("Could not resolve study id");
      await saveStudyId(studyId);
      setSavedPmids((prev) => {
        const next = new Set(prev);
        next.add(study.pmid);
        return next;
      });
      setStudyIdByPmid((prev) => {
        const next = new Map(prev);
        next.set(study.pmid, studyId);
        return next;
      });
    },
    [saveStudyId]
  );

  /** Remove by PMID (resolves the studies.id from the loaded set). */
  const removePmid = useCallback(
    async (pmid: string) => {
      const studyId = studyIdByPmid.get(pmid);
      if (studyId) {
        await removeStudyId(studyId);
      }
      setSavedPmids((prev) => {
        const next = new Set(prev);
        next.delete(pmid);
        return next;
      });
      setStudyIdByPmid((prev) => {
        const next = new Map(prev);
        next.delete(pmid);
        return next;
      });
    },
    [studyIdByPmid, removeStudyId]
  );

  return {
    signedIn,
    loaded,
    savedPmids,
    savedStudyIds,
    savePmid,
    removePmid,
    saveStudyId,
    removeStudyId,
  };
}
