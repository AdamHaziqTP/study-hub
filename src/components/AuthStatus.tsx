"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * AuthStatus - header-level sign-in / sign-out control.
 *
 * Uses the @supabase/ssr browser client (cookie-based session). When signed
 * in it shows the user's identity + a sign-out button; otherwise it shows
 * "Sign in with GitHub" AND "Sign in with Google" buttons (Task 27 — two
 * providers) that start the relevant OAuth flow.
 *
 * The OAuth redirect is threaded so the user lands BACK on the page they
 * were on after authenticating:
 *   /auth/callback?next=<pathname>
 *
 * NOTE: This is a CLIENT COMPONENT (uses hooks + the browser cookie client),
 * so it must be imported from server components like the Library page only
 * as a child component - which Next.js renders on the client automatically.
 */
export default function AuthStatus() {
  const [user, setUser] = useState<{ email?: string; userName?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const u = data.user;
      setUser(
        u
          ? {
              email: u.email ?? undefined,
              userName:
                u.user_metadata?.user_name ??
                u.user_metadata?.full_name ??
                u.user_metadata?.name ??
                undefined,
            }
          : null
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = async (provider: "github" | "google") => {
    setBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname
    )}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      console.error("Sign-in failed:", error.message);
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setBusy(false);
  };

  if (loading) {
    return (
      <span className="h-9 w-24 rounded-lg bg-gray-100 animate-pulse inline-block" />
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 font-medium truncate max-w-[9rem]">
          {user.userName ?? user.email ?? "Signed in"}
        </span>
        <button
          onClick={handleSignOut}
          disabled={busy}
          className="border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          {busy ? "Signing out..." : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => handleSignIn("github")}
        disabled={busy}
        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {busy ? "Redirecting..." : "Sign in with GitHub"}
      </button>
      <button
        onClick={() => handleSignIn("google")}
        disabled={busy}
        className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {busy ? "Redirecting..." : "Sign in with Google"}
      </button>
    </div>
  );
}