"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

interface PersonalNotesProps {
  /** UUID of the study row in `studies` (null when the study is not saved yet). */
  studyId: string | null;
  pmid: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * PersonalNotes - per-study, per-user private notes (Task 6).
 *
 * Product rule: this is the FIRST user-owned feature. `study_notes` rows are
 * locked by RLS to auth.uid() = user_id, and user_id DEFAULTS to auth.uid()
 * in the DB - the client never sends it.
 *
 * UX flow:
 *   1. Unauthenticated -> "Log in to add personal notes" call-to-action.
 *   2. Authenticated + study not yet saved -> hint to save it first.
 *   3. Authenticated + saved study -> editable textarea; Save does
 *      INSERT-if-missing / UPDATE-if-exists.
 */
export default function PersonalNotes({ studyId, pmid }: PersonalNotesProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  // Tracks the studyId this component last loaded a note for, so we can reset
  // the note when the user saves the study for the first time (studyId flips
  // from null to a UUID) without re-fetching on every render.
  const prevStudyId = useRef<string | null>(null);

  // 1) Resolve the signed-in user (if any) on mount.
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

  // 2) When a signed-in user + studyId become available, load their note.
  //    If studyId changed since the last load (e.g. the user just saved the
  //    study), reset the note + loaded flag so the fresh row is fetched.
  useEffect(() => {
    if (prevStudyId.current !== studyId) {
      prevStudyId.current = studyId;
      setLoaded(false);
      setNote("");
    }
    if (!userId || !studyId) return;

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const { data } = await supabase
          .from("study_notes")
          .select("note_text")
          .eq("study_id", studyId)
          .maybeSingle();
        if (cancelled) return;
        if (data?.note_text) setNote(data.note_text);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, studyId]);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname
    )}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo },
    });
    if (error) {
      console.error("Sign-in failed:", error.message);
      setBusy(false);
    }
  }, []);

  const handleSave = async () => {
    if (!userId || !studyId) return;
    setSaveState("saving");
    try {
      const supabase = createClient();

      // Is there an existing note row? (RLS: only the user's own row is visible.)
      const { data: existing } = await supabase
        .from("study_notes")
        .select("id")
        .eq("study_id", studyId)
        .maybeSingle();

      if (existing) {
        // UPDATE - keep the user's own row; user_id is never touched.
        const { error } = await supabase
          .from("study_notes")
          .update({ note_text: note, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // INSERT - user_id DEFAULTS to auth.uid() in the DB. The client
        // never sends user_id, so a row can't be written for someone else.
        const { error } = await supabase
          .from("study_notes")
          .insert({ study_id: studyId, note_text: note });
        if (error) throw error;
      }

      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      console.error("Save note failed:", err);
      setSaveState("error");
    }
  };

  // ---- Unauthenticated: login call-to-action ----
  if (!authLoading && !userId) {
    return (
      <div className="p-6 rounded-xl border border-dashed border-gray-300 bg-white text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">
          Log in to add personal notes
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Keep a private note on this study - e.g. "this changes how I'd
          program triceps."
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
      <div className="p-6 rounded-xl border border-gray-200 bg-white animate-pulse">
        <div className="h-3 w-32 bg-gray-200 rounded mb-3" />
        <div className="h-24 w-full bg-gray-100 rounded" />
      </div>
    );
  }

  // ---- Signed in, but the study isn't saved to the library yet ----
  if (!studyId) {
    return (
      <div className="p-6 rounded-xl border border-dashed border-gray-300 bg-white">
        <p className="text-sm text-gray-600">
          Personal notes are attached to studies in your library.{" "}
          <span className="font-medium text-gray-800">
            Save this study to the library first
          </span>{" "}
          (using the "Save to Library" button above), then come back
          here to write your own note on PMID {pmid}.
        </p>
      </div>
    );
  }

  // ---- Signed in + saved study: the editable note ----
  return (
    <div className="p-6 rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Your personal note</h3>
        <span className="text-xs text-gray-400">Private - only you can see this</span>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={5}
        placeholder="e.g. This study changes how I'd program triceps - the overhead position hit the long head harder..."
        className="w-full border border-gray-300 bg-white rounded-lg p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saveState === "saving" ? "Saving..." : "Save note"}
        </button>

        {saveState === "saved" && (
          <span className="text-sm text-green-600 font-medium">Note saved</span>
        )}
        {saveState === "error" && (
          <span className="text-sm text-red-600 font-medium">
            Failed to save. Please try again.
          </span>
        )}
      </div>
    </div>
  );
}