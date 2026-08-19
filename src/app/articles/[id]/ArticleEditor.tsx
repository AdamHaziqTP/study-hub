"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthStatus from "@/components/AuthStatus";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/browser";
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_LABELS,
  type ArticleDraft,
  type DraftClaim,
  type DraftLink,
  type EvidenceRelationship,
  type LinkableStudy,
} from "@/lib/articles";

interface ArticleEditorProps {
  articleId: string;
}

type LoadState = "auth" | "loading" | "ready" | "notfound" | "error";

/** Verdict from /api/assess-claim. */
type AlignmentVerdict = "aligned" | "partially_aligned" | "unaligned";

interface AlignmentResult {
  verdict: AlignmentVerdict;
  reasoning: string;
}

type AlignmentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: AlignmentResult }
  | { status: "error"; message: string };

const ALIGNMENT_CHIP_STYLES: Record<AlignmentVerdict, string> = {
  aligned: "bg-green-100 text-green-800",
  partially_aligned: "bg-amber-100 text-amber-800",
  unaligned: "bg-red-100 text-red-800",
};

const ALIGNMENT_LABELS: Record<AlignmentVerdict, string> = {
  aligned: "Aligned",
  partially_aligned: "Partially aligned",
  unaligned: "Unaligned",
};

/**
 * ArticleEditor - the core Task 7 UI.
 *
 * Lets the signed-in user edit an article: title + content, a list of claims,
 * and — per claim — evidence links to studies already saved in the shared
 * library, each tagged supports / contradicts / mixed / contextual.
 *
 * Security model (matches the schema): articles, claims and evidence_links are
 * PRIVATE, RLS-locked to auth.uid() = user_id, with user_id DEFAULTING to
 * auth.uid() in the DB — the client NEVER sends user_id. A non-owner simply
 * gets zero rows back, which we surface as "not found / no access".
 *
 * Save strategy: one "Save" click upserts the article row, then diffs claims
 * and evidence links against what was loaded (INSERT new, UPDATE changed,
 * DELETE removed). The studies table stays public-read only.
 */

/**
 * Text-matching highlight renderer for the article backdrop. Each claim's text
 * is RE-LOCATED in the current article on every render (first occurrence), so
 * the highlight can never drift as the user edits — there are no stored
 * character offsets to go stale. Trailing whitespace is left unhighlighted so
 * there's no blocky overhang past the last word.
 */
function renderHighlightRanges(
  content: string,
  claims: { key: string; text: string }[]
): React.ReactNode[] {
  const matches: { start: number; end: number; key: string }[] = [];
  for (const claim of claims) {
    const text = claim.text.trim();
    if (!text) continue;
    const idx = content.indexOf(text);
    if (idx === -1) continue; // not found (e.g. edited inside) → skip
    matches.push({ start: idx, end: idx + text.length, key: claim.key });
  }
  if (matches.length === 0) return [content];

  matches.sort((a, b) => a.start - b.start);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    if (m.start > cursor) nodes.push(content.slice(cursor, m.start));
    // Don't paint a background over invisible trailing whitespace (e.g. the
    // space users grab after a period) — render it as plain text after the mark.
    let visibleEnd = m.end;
    while (visibleEnd > m.start && /\s/.test(content[visibleEnd - 1])) {
      visibleEnd--;
    }
    if (visibleEnd > m.start) {
      nodes.push(
        <mark
          key={m.key}
          // text-transparent: only the amber background shows behind the
          // textarea — the textarea renders the actual (crisp) text.
          className="bg-amber-200 dark:bg-amber-500/30 text-transparent rounded px-0.5 py-px"
          title="Claim — highlight shown in the article"
        >
          {content.slice(m.start, visibleEnd)}
        </mark>
      );
    }
    if (visibleEnd < m.end) nodes.push(content.slice(visibleEnd, m.end));
    cursor = m.end;
  }
  nodes.push(content.slice(cursor));
  return nodes;
}

export default function ArticleEditor({ articleId }: ArticleEditorProps) {  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("auth");
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArticleDraft>({
    id: null,
    title: "",
    content: "",
    claims: [],
  });
  const [savedStudies, setSavedStudies] = useState<LinkableStudy[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Claim alignment check (Task 9): keyed by claim.key so each claim can be
  // assessed independently. The result is cleared whenever the claim text or
  // its links change so a stale verdict is never shown.
  const [alignmentByClaim, setAlignmentByClaim] = useState<
    Record<string, AlignmentState>
  >({});

  // Track what was loaded from the DB so Save can compute INSERTs/UPDATEs/DELETEs.
  const initialClaims = useRef<{ id: string; text: string }[]>([]);
  const initialLinks = useRef<
    { id: string; claimId: string; relationship: EvidenceRelationship }[]
  >([]);

  // Ref to the Article content textarea, so a selection can be turned into a claim.
  const contentRef = useRef<HTMLTextAreaElement>(null);
  // Backdrop highlight layer — must scroll in lock-step with the textarea so
  // highlights stay glued to the words.
  const backdropRef = useRef<HTMLDivElement>(null);
  // Tracks the textarea's value + caret before each edit, so claim character
  // offsets can be shifted/kept in sync as the article changes.
  const beforeRef = useRef({ value: "", selStart: 0 });

  // 1) Auth check + initial load (article, claims, links, saved studies).
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (cancelled) return;
        const uid = authData.user?.id ?? null;
        setUserId(uid);

        if (!uid) {
          setLoadState("ready");
          return;
        }

        // Load the article row (RLS: only the owner sees it).
        const { data: articleRow, error: articleError } = await supabase
          .from("articles")
          .select("id, title, content")
          .eq("id", articleId)
          .maybeSingle();

        if (cancelled) return;
        if (articleError) {
          console.error("Load article failed:", articleError);
          setLoadState("error");
          return;
        }
        if (!articleRow) {
          setLoadState("notfound");
          return;
        }

        // Load claims for this article.
        const { data: claimRows, error: claimError } = await supabase
          .from("claims")
          .select("id, text")
          .eq("article_id", articleId)
          .order("created_at", { ascending: true });

        if (cancelled) return;
        if (claimError) {
          console.error("Load claims failed:", claimError);
          setLoadState("error");
          return;
        }

        const claims = (claimRows ?? []).map((c) => ({
          id: c.id as string,
          text: c.text as string,
        }));
        initialClaims.current = claims;

        // Load evidence links + their study titles (studies stays public-read).
        // RLS: only the user's own evidence_links rows are visible.
        const linkIds = claims.map((c) => c.id);
        const { data: linkRows, error: linkError } =
          linkIds.length > 0
            ? await supabase
                .from("evidence_links")
                .select("id, claim_id, relationship, studies(id, pmid, title, journal)")
                .in("claim_id", linkIds)
            : { data: [], error: null };

        if (cancelled) return;
        if (linkError) {
          console.error("Load evidence links failed:", linkError);
          setLoadState("error");
          return;
        }

        // Load the user's OWN saved studies for linking (library is per-account).
        const { data: studyRows, error: studiesError } = await supabase
          .from("user_saved_studies")
          .select("studies(id, pmid, title, journal)")
          .order("created_at", { ascending: false });

        if (cancelled) return;
        if (studiesError) {
          console.error("Load studies failed:", studiesError);
          setLoadState("error");
          return;
        }

        type LinkRowShape = {
          id: string;
          claim_id: string;
          relationship: EvidenceRelationship;
          studies: {
            id: string;
            pmid: string;
            title: string;
            journal: string | null;
          } | null;
        };

        const rawLinks = (linkRows ?? []) as LinkRowShape[];
        const links: DraftLink[] = rawLinks.map((row) => ({
          key:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${row.id}-${Math.random()}`,
          id: row.id,
          studyId: row.studies?.id ?? "",
          studyTitle: row.studies?.title ?? "Unknown study",
          studyPmid: row.studies?.pmid ?? "",
          relationship: row.relationship,
        }));
        initialLinks.current = rawLinks.map((row) => ({
          id: row.id,
          claimId: row.claim_id,
          relationship: row.relationship,
        }));

        // Group links by claim (a link belongs to exactly one claim).
        const linksByClaimId = new Map<string, DraftLink[]>();
        for (const row of rawLinks) {
          const arr = linksByClaimId.get(row.claim_id) ?? [];
          // Find the matching DraftLink (already keyed above).
          const match = links.find((l) => l.id === row.id);
          if (match) arr.push(match);
          linksByClaimId.set(row.claim_id, arr);
        }
        const loadedContent = (articleRow.content as string | null) ?? "";
        // Locate each loaded claim's text inside the article so its highlight
        // offsets are known (article is the single source of truth).
        const claimsWithLinks: DraftClaim[] = claims.map((c) => {
          const idx = loadedContent.indexOf(c.text);
          return {
            key:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${c.id}-${Math.random()}`,
            id: c.id,
            text: c.text,
            links: linksByClaimId.get(c.id) ?? [],
            start: idx >= 0 ? idx : null,
            end: idx >= 0 ? idx + c.text.length : null,
          };
        });

        beforeRef.current = { value: loadedContent, selStart: 0 };

        setSavedStudies(
          ((studyRows ?? []) as unknown as Array<{ studies: LinkableStudy | null }>)
            .map((r) => r.studies)
            .filter((s): s is LinkableStudy => s !== null)
        );
        setDraft({
          id: articleRow.id as string,
          title: (articleRow.title as string) ?? "",
          content: loadedContent,
          claims: claimsWithLinks,
        });
        setLoadState("ready");
      } catch (err) {
        console.error("Article load failed:", err);
        if (!cancelled) setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId]);

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

  const describeError = (err: unknown): string => {
    if (err && typeof err === "object") {
      const e = err as { message?: string; code?: string; hint?: string };
      const parts: string[] = [];
      if (e.message) parts.push(e.message);
      if (e.code) parts.push(`(code ${e.code})`);
      if (e.hint) parts.push(`hint: ${e.hint}`);
      if (parts.length > 0) return parts.join(" ");
    }
    return err instanceof Error ? err.message : "Unknown error";
  };

  // ---- Draft mutation helpers (all functional — never read stale closure) ----
  const newKey = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `key-${Math.random().toString(36).slice(2)}`;

  const updateDraft = (patch: Partial<ArticleDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const patchClaims = (fn: (claims: DraftClaim[]) => DraftClaim[]) =>
    setDraft((d) => ({ ...d, claims: fn(d.claims) }));

  const addClaim = (initialText = "") => {
    const claim: DraftClaim = {
      key: newKey(),
      id: null,
      text: initialText,
      links: [],
      start: null,
      end: null,
    };
    patchClaims((claims) => [...claims, claim]);
    setSearch("");
  };

  /** Turn the text currently selected in the Article content box into a claim. */
  const addClaimFromSelection = () => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const text = el.value.slice(start, end).trim();
    if (!text || start === end) return;
    const claim: DraftClaim = {
      key: newKey(),
      id: null,
      text,
      links: [],
      start,
      end,
    };
    patchClaims((claims) => [...claims, claim]);
    setSearch("");
  };

  /**
   * Handle an article-content edit. The article is the single source of truth;
   * claim highlights re-locate each claim's text on every render (no stored
   * offsets), so nothing here needs to shift ranges.
   */
  const handleContentChange = (newValue: string, _newSelStart: number) => {
    beforeRef.current.value = newValue;
    setDraft((d) => ({ ...d, content: newValue }));
    // The article changed — alignment verdicts are stale.
    setAlignmentByClaim({});
  };

  const removeClaim = (key: string) => {
    patchClaims((claims) => claims.filter((c) => c.key !== key));
  };

  const clearAlignment = (claimKey: string) => {
    setAlignmentByClaim((map) => {
      if (!map[claimKey]) return map;
      const next = { ...map };
      delete next[claimKey];
      return next;
    });
  };

  const addLink = (claimKey: string, study: LinkableStudy) => {
    // Prevent the same study being linked twice on the same claim.
    patchClaims((claims) =>
      claims.map((c) => {
        if (c.key !== claimKey) return c;
        if (c.links.some((l) => l.studyId === study.id)) return c;
        const link: DraftLink = {
          key: newKey(),
          id: null,
          studyId: study.id,
          studyTitle: study.title,
          studyPmid: study.pmid,
          relationship: "supports",
        };
        return { ...c, links: [...c.links, link] };
      })
    );
    // The linked studies changed — a previously computed verdict is stale.
    clearAlignment(claimKey);
  };

  const updateLinkRelationship = (
    claimKey: string,
    linkKey: string,
    relationship: EvidenceRelationship
  ) => {
    patchClaims((claims) =>
      claims.map((c) =>
        c.key === claimKey
          ? {
              ...c,
              links: c.links.map((l) =>
                l.key === linkKey ? { ...l, relationship } : l
              ),
            }
          : c
      )
    );
    // The relationship affects interpretation — clear the stale verdict.
    clearAlignment(claimKey);
  };

  const removeLink = (claimKey: string, linkKey: string) => {
    patchClaims((claims) =>
      claims.map((c) =>
        c.key === claimKey
          ? { ...c, links: c.links.filter((l) => l.key !== linkKey) }
          : c
      )
    );
    // The linked studies changed — clear the stale verdict.
    clearAlignment(claimKey);
  };

  /**
   * Run the claim alignment check (Task 9): POST the claim text + its linked
   * study ids to /api/assess-claim, which resolves the studies' abstracts
   * (server-side) and returns an aligned / partially_aligned / unaligned
   * verdict with reasoning. Requires at least one linked study.
   */
  const handleAssessClaim = async (claim: DraftClaim) => {
    if (!claim.text.trim()) return;
    if (claim.links.length === 0) return;

    setAlignmentByClaim((map) => ({
      ...map,
      [claim.key]: { status: "loading" },
    }));

    try {
      const res = await fetch("/api/assess-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimText: claim.text,
          studyIds: claim.links.map((l) => l.studyId),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Assessment failed");
      }
      const json = await res.json();
      const result: AlignmentResult = {
        verdict: json.verdict,
        reasoning: json.reasoning,
      };
      setAlignmentByClaim((map) => ({
        ...map,
        [claim.key]: { status: "done", result },
      }));
    } catch (err) {
      setAlignmentByClaim((map) => ({
        ...map,
        [claim.key]: {
          status: "error",
          message: err instanceof Error ? err.message : "Assessment failed",
        },
      }));
    }
  };

  // ---- Save ----
  const handleSave = async () => {
    if (!userId || !draft.id) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const supabase = createClient();

    // patchedClaims mirrors the draft but with REAL db ids filled in for
    // newly created claims / links, so a second save diffs correctly instead
    // of re-INSERTing (which would violate the UNIQUE claim_id+study_id).
    let patchedClaims: DraftClaim[] = draft.claims;

    try {
      // 1) Upsert the article row.
      const { error: articleError } = await supabase
        .from("articles")
        .update({
          title: draft.title,
          content: draft.content,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      if (articleError) throw new Error(`Article: ${describeError(articleError)}`);

      // 2) Upsert claims, capturing real ids for new ones.
      const claimIdByKey = new Map<string, string>();
      patchedClaims = draft.claims.map((claim) => {
        claimIdByKey.set(claim.key, claim.id ?? claim.key);
        return claim;
      });
      for (const claim of draft.claims) {
        if (claim.id) {
          const { error } = await supabase
            .from("claims")
            .update({ text: claim.text })
            .eq("id", claim.id);
          if (error) throw new Error(`Claim: ${describeError(error)}`);
        } else {
          const { data, error } = await supabase
            .from("claims")
            .insert({ article_id: draft.id, text: claim.text })
            .select("id")
            .single();
          if (error) throw new Error(`Claim: ${describeError(error)}`);
          const newId = (data as { id: string }).id;
          claimIdByKey.set(claim.key, newId);
          patchedClaims = patchedClaims.map((c) =>
            c.key === claim.key ? { ...c, id: newId } : c
          );
        }
      }

      // 3) Delete claims that were removed (cascades their evidence links).
      const keptIds = patchedClaims
        .map((c) => c.id as string)
        .filter(Boolean);
      const removedClaims = initialClaims.current.filter(
        (ic) => !keptIds.includes(ic.id)
      );
      for (const rc of removedClaims) {
        const { error } = await supabase.from("claims").delete().eq("id", rc.id);
        if (error) throw new Error(`Delete claim: ${describeError(error)}`);
      }

      // 4) Upsert evidence links per claim, capturing real ids for new ones.
      for (const claim of patchedClaims) {
        const claimId = claimIdByKey.get(claim.key);
        if (!claimId) continue;

        for (const link of claim.links) {
          if (link.id) {
            const { error } = await supabase
              .from("evidence_links")
              .update({ relationship: link.relationship })
              .eq("id", link.id)
              .eq("user_id", userId);
            if (error) throw new Error(`Link: ${describeError(error)}`);
          } else {
            const { data, error } = await supabase
              .from("evidence_links")
              .insert({
                claim_id: claimId,
                study_id: link.studyId,
                relationship: link.relationship,
              })
              .select("id")
              .single();
            if (error) throw new Error(`Link: ${describeError(error)}`);
            const newLinkId = (data as { id: string }).id;
            patchedClaims = patchedClaims.map((c) =>
              c.key === claim.key
                ? {
                    ...c,
                    links: c.links.map((l) =>
                      l.key === link.key ? { ...l, id: newLinkId } : l
                    ),
                  }
                : c
            );
          }
        }
      }

      // 5) Delete links that were removed from a claim.
      const keptLinkIds = patchedClaims.flatMap((c) =>
        c.links.filter((l) => l.id).map((l) => l.id as string)
      );
      const removedLinks = initialLinks.current.filter(
        (il) => !keptLinkIds.includes(il.id)
      );
      for (const rl of removedLinks) {
        const { error } = await supabase
          .from("evidence_links")
          .delete()
          .eq("id", rl.id);
        if (error) throw new Error(`Delete link: ${describeError(error)}`);
      }

      // 6) Refresh the draft + snapshot so a second save diffs correctly.
      const savedClaimIdByKey = new Map<string, string>();
      for (const claim of patchedClaims) {
        if (claim.id) savedClaimIdByKey.set(claim.key, claim.id);
      }
      initialClaims.current = patchedClaims
        .filter((c) => c.id)
        .map((c) => ({ id: c.id as string, text: c.text }));
      initialLinks.current = patchedClaims.flatMap((c) =>
        c.links
          .filter((l) => l.id && c.id)
          .map((l) => ({
            id: l.id as string,
            claimId: savedClaimIdByKey.get(c.key) as string,
            relationship: l.relationship,
          }))
      );
      setDraft((d) => ({ ...d, claims: patchedClaims }));

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch (err) {
      console.error("Save article failed:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  /** Delete the whole article + claims + evidence links (RLS-scoped to owner). */
  const handleDeleteArticle = async () => {
    if (!articleId) return;
    if (
      !window.confirm(
        "Delete this article and all its claims? This cannot be undone."
      )
    ) {
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const { data: claimRows } = await supabase
        .from("claims")
        .select("id")
        .eq("article_id", articleId);
      const claimIds = (claimRows ?? []).map((c) => c.id as string);
      if (claimIds.length > 0) {
        await supabase.from("evidence_links").delete().in("claim_id", claimIds);
      }
      await supabase.from("claims").delete().eq("article_id", articleId);
      const { error } = await supabase.from("articles").delete().eq("id", articleId);
      if (error) throw new Error(`Delete: ${describeError(error)}`);
      router.push("/articles");
    } catch (err) {
      console.error("Delete article failed:", err);
      setSaveError(err instanceof Error ? err.message : "Failed to delete article");
    } finally {
      setBusy(false);
    }
  };

  // ---- Unauthenticated ----
  if (loadState === "auth") {
    return (
      <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white animate-pulse">
        <div className="h-8 w-1/2 bg-gray-200 rounded mb-4" />
        <div className="h-4 w-full bg-gray-100 rounded mb-2" />
        <div className="h-4 w-3/4 bg-gray-100 rounded" />
      </div>
    );
  }

  if (loadState === "ready" && !userId) {
    return (
      <div className="p-12 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 text-center">
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Log in to edit this article
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

  // ---- Not found / no access ----
  if (loadState === "notfound") {
    return (
      <div className="p-12 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 text-center">
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Article not found
        </p>
        <p className="text-sm text-gray-500 mb-6">
          This article does not exist, or was written by someone else.
        </p>
        <Link
          href="/articles"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          ← Back to my articles
        </Link>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="p-12 rounded-xl border border-red-200 bg-red-50 text-center">
        <p className="text-lg font-semibold text-red-700 mb-2">Failed to load</p>
        <p className="text-sm text-red-600 mb-6">
          Something went wrong loading this article. Please try again.
        </p>
        <Link
          href="/articles"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          ← Back to my articles
        </Link>
      </div>
    );
  }

  // ---- Ready + signed in: the editor ----
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
      <div className="max-w-6xl mx-auto p-8 lg:h-screen lg:flex lg:flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <Link
            href="/articles"
            className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            ← My Articles
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <AuthStatus />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="flex-1 min-w-[220px]">
            <input
              value={draft.title}
              onChange={(e) => updateDraft({ title: e.target.value })}
              placeholder="Article title"
              className="w-full text-3xl font-bold leading-tight bg-transparent border-b-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none pb-2 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/articles/${articleId}/read`}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm whitespace-nowrap"
            >
              Read
            </Link>
            <button
              onClick={handleDeleteArticle}
              disabled={busy}
              className="border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-lg font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-sm whitespace-nowrap disabled:opacity-50"
            >
              {busy ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm whitespace-nowrap"
            >
              {saving ? "Saving..." : "Save article"}
            </button>
          </div>
        </div>

        {saved && (
          <div className="mb-6 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            Article saved.
          </div>
        )}
        {saveError && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Failed to save: {saveError}
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-8 overflow-y-auto lg:overflow-hidden">
        {/* Article content — the main writing area (fills the viewport height) */}
        <section className="mb-10 lg:col-span-3 lg:h-full lg:min-h-0 lg:flex lg:flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Article
            </h2>
            <button
              onClick={addClaimFromSelection}
              className="text-xs font-semibold border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              title="Select text in the article, then click to add it as a claim you can link studies to"
            >
              ✂ Turn selection into a claim
            </button>
          </div>
          {/* In-place claim highlighting: a perfectly mirrored highlight layer
              sits behind the (transparent) textarea, so claims are highlighted
              exactly where you type. Both layers use IDENTICAL metrics
              (padding, font, line-height, wrap, scrollbar) so the highlights
              line up with the words. */}
          <div className="relative w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-lg min-h-[420px] lg:flex-1 lg:min-h-0 overflow-hidden">
            <div
              ref={backdropRef}
              aria-hidden="true"
              className="absolute inset-0 overflow-y-auto p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words text-transparent pointer-events-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                fontFamily: "inherit",
                letterSpacing: "inherit",
                wordSpacing: "inherit",
                tabSize: 4,
              }}
            >
              {renderHighlightRanges(
                draft.content,
                draft.claims.map((c) => ({ key: c.key, text: c.text }))
              )}
            </div>
            <textarea
              ref={contentRef}
              value={draft.content}
              onChange={(e) => handleContentChange(e.target.value, e.target.selectionStart)}
              onScroll={(e) => {
                if (backdropRef.current) {
                  backdropRef.current.scrollTop = e.currentTarget.scrollTop;
                }
              }}
              onSelect={() =>
                (beforeRef.current.selStart = contentRef.current?.selectionStart ?? 0)
              }
              rows={16}
              placeholder="Write your conclusion here — the reasoning that ties your claims together... Select a sentence and hit “Turn selection into a claim” to highlight it."
              className="relative block w-full h-full min-h-[420px] bg-transparent p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200 focus:outline-none resize-none overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:min-h-0"
              style={{
                fontFamily: "inherit",
                letterSpacing: "inherit",
                wordSpacing: "inherit",
                tabSize: 4,
              }}
            />
          </div>
        </section>

        {/* Claims — independently scrollable sidebar (article stays fixed on the left) */}
        <section className="mb-10 lg:col-span-2 lg:h-full lg:min-h-0 lg:flex lg:flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">
              Claims{" "}
              <span className="text-sm font-normal text-gray-400">
                ({draft.claims.length})
              </span>
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 -mt-2">
            Select a sentence in your article and hit{" "}
            <span className="font-semibold">✂ Turn selection into a claim</span>{" "}
            to add one.
          </p>

          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {draft.claims.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 text-center">
              <p className="text-sm text-gray-500">
                No claims yet. A claim is a single statement in your article —
                each one can be linked to the studies that support or
                contradict it.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {draft.claims.map((claim, index) => (
                <div
                  id={`claim-${claim.key}`}
                  key={claim.key}
                  className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 scroll-mt-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Claim {index + 1}
                    </span>
                    <button
                      onClick={() => removeClaim(claim.key)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove claim
                    </button>
                  </div>

                  {/* Read-only: the claim text captured when it was highlighted
                      in the article. */}
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-800 dark:text-gray-200 leading-relaxed mb-4">
                    {claim.text}
                  </div>

                  {/* Alignment check (Task 9) */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-gray-500">
                        Claim alignment
                      </p>
                      <button
                        onClick={() => handleAssessClaim(claim)}
                        disabled={
                          !claim.text.trim() ||
                          claim.links.length === 0 ||
                          alignmentByClaim[claim.key]?.status === "loading"
                        }
                        title={
                          claim.links.length === 0
                            ? "Link at least one study to check alignment"
                            : "Check whether this claim accurately represents its linked studies"
                        }
                        className="text-xs font-semibold border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {alignmentByClaim[claim.key]?.status === "loading"
                          ? "Checking..."
                          : alignmentByClaim[claim.key]?.status === "done"
                            ? "Re-check alignment"
                            : "Check alignment"}
                      </button>
                    </div>

                    {alignmentByClaim[claim.key]?.status === "error" &&
                      (() => {
                        const state = alignmentByClaim[claim.key];
                        if (state.status !== "error") return null;
                        return (
                          <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                            Failed to check alignment.
                            {state.message ? ` ${state.message}` : ""}
                          </div>
                        );
                      })()}

                    {alignmentByClaim[claim.key]?.status === "done" &&
                      (() => {
                        const state = alignmentByClaim[claim.key];
                        if (state.status !== "done") return null;
                        return (
                          <div className="mt-2 space-y-1.5">
                            <span
                              className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${ALIGNMENT_CHIP_STYLES[state.result.verdict]}`}
                            >
                              {ALIGNMENT_LABELS[state.result.verdict]}
                            </span>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                              {state.result.reasoning}
                            </p>
                          </div>
                        );
                      })()}
                  </div>

                  {/* Evidence links for this claim */}
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">
                      Linked studies
                    </p>
                    {claim.links.length === 0 ? (
                      <p className="text-xs text-gray-400 italic mb-2">
                        No studies linked yet — search your library below to add
                        evidence.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {claim.links.map((link) => (
                          <div
                            key={link.key}
                            className="flex items-center justify-between gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5"
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/study/${link.studyPmid}`}
                                target="_blank"
                                className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-700 transition-colors line-clamp-1"
                              >
                                {link.studyTitle}
                              </Link>
                              <p className="text-xs text-gray-400 font-mono">
                                PMID: {link.studyPmid}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={link.relationship}
                                onChange={(e) =>
                                  updateLinkRelationship(
                                    claim.key,
                                    link.key,
                                    e.target.value as EvidenceRelationship
                                  )
                                }
                                className={`text-xs font-semibold border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none ${RELATIONSHIP_COLORS[link.relationship]}`}
                              >
                                {(Object.keys(RELATIONSHIP_LABELS) as EvidenceRelationship[]).map(
                                  (r) => (
                                    <option key={r} value={r}>
                                      {RELATIONSHIP_LABELS[r]}
                                    </option>
                                  )
                                )}
                              </select>
                              <button
                                onClick={() => removeLink(claim.key, link.key)}
                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                                title="Remove link"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Study library picker */}
                  <StudyPicker
                    search={search}
                    onSearch={setSearch}
                    savedStudies={savedStudies}
                    alreadyLinkedIds={claim.links.map((l) => l.studyId)}
                    onAdd={(study) => addLink(claim.key, study)}
                  />
                </div>
              ))}
            </div>
          )}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}

/** Searchable list of saved studies used to attach evidence to a claim. */
function StudyPicker({
  search,
  onSearch,
  savedStudies,
  alreadyLinkedIds,
  onAdd,
}: {
  search: string;
  onSearch: (s: string) => void;
  savedStudies: LinkableStudy[];
  alreadyLinkedIds: string[];
  onAdd: (study: LinkableStudy) => void;
}) {
  const q = search.trim().toLowerCase();
  const visible = savedStudies.filter(
    (s) =>
      !alreadyLinkedIds.includes(s.id) &&
      (!q ||
        s.title.toLowerCase().includes(q) ||
        s.pmid.includes(q) ||
        (s.journal ?? "").toLowerCase().includes(q))
  );

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search saved studies to link (by title, PMID, or journal)..."
        className="w-full border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 rounded-lg p-2.5 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
      />
      {visible.length === 0 ? (
        <p className="text-xs text-gray-400 italic px-1">
          {alreadyLinkedIds.length > 0 && !q
            ? "All saved studies are linked to this claim."
            : q
              ? "No saved studies match your search."
              : "No saved studies yet — save studies from the Explorer first."}
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1.5">
          {visible.map((study) => (
            <div
              key={study.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-800 dark:text-gray-200 font-medium line-clamp-1">
                  {study.title}
                </p>
                <p className="text-xs text-gray-400 font-mono">
                  PMID: {study.pmid}
                </p>
              </div>
              <button
                onClick={() => onAdd(study)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 shrink-0"
              >
                Link
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}