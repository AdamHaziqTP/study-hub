import type { Metadata } from "next";
import AuthStatus from "@/components/AuthStatus";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import ArticlesList from "./ArticlesList";

/**
 * /articles — the user's Evidence Notebook articles (Task 7).
 *
 * Articles are PRIVATE (RLS-locked to auth.uid()), so the list is loaded
 * client-side via the @supabase/ssr browser client (which carries the user's
 * session cookies) in <ArticlesList>. This shell only provides the page
 * header + AuthStatus like the other top-level pages.
 */
export const metadata: Metadata = {
  title: "My Articles",
  description:
    "Write and organize your own evidence-backed conclusions on Study Hub — claims linked to saved studies with supports, contradicts, mixed, or contextual relationships.",
  openGraph: {
    type: "website",
    url: "/articles",
    title: "My Articles | Study Hub",
    description:
      "Write and organize your own evidence-backed conclusions on Study Hub — claims linked to saved studies with supports, contradicts, mixed, or contextual relationships.",
  },
};

export const dynamic = "force-dynamic";

export default function ArticlesPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">My Articles</h1>
          <div className="flex items-center gap-4">
            <AuthStatus />
            <ThemeToggle />
            <Link
              href="/graph"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Evidence Graph →
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← Back to search
            </Link>
          </div>
        </div>

        <ArticlesList />
      </div>
    </div>
  );
}