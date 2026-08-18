import AuthStatus from "@/components/AuthStatus";
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
export const dynamic = "force-dynamic";

export default function ArticlesPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">My Articles</h1>
          <div className="flex items-center gap-4">
            <AuthStatus />
            <Link
              href="/graph"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Evidence Graph →
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
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