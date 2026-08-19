import type { Metadata } from "next";
import AuthStatus from "@/components/AuthStatus";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import EvidenceGraph from "./EvidenceGraph";

/**
 * /graph — the interactive evidence graph (Task 8).
 *
 * Visualizes the signed-in user's ARTICLES → CLAIMS → EVIDENCE_LINKS → STUDIES
 * as a force-directed graph with relationship-colored edges.
 *
 * The data is PRIVATE (RLS-locked to auth.uid()), so — exactly like /articles —
 * this shell only provides the page header + AuthStatus, and <EvidenceGraph>
 * loads the graph client-side via the @supabase/ssr browser client (which
 * carries the user's session cookies).
 */
export const metadata: Metadata = {
  title: "Evidence Graph",
  description:
    "Visualize your evidence graph on Study Hub — articles, claims, and saved studies connected by relationship-colored edges, rendered live with d3-force physics.",
  openGraph: {
    type: "website",
    url: "/graph",
    title: "Evidence Graph | Study Hub",
    description:
      "Visualize your evidence graph on Study Hub — articles, claims, and saved studies connected by relationship-colored edges, rendered live with d3-force physics.",
  },
};

export const dynamic = "force-dynamic";

export default function GraphPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Evidence Graph</h1>
          <div className="flex items-center gap-4">
            <AuthStatus />
            <ThemeToggle />
            <Link
              href="/articles"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              My Articles →
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← Back to search
            </Link>
          </div>
        </div>

        {/* Task 28 — Evidence Graph explanation: a plain-English onboarding
            blurb so a first-time visitor understands what the graph is, what
            the colors mean, and how to populate it. */}
        <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
            What is this graph?
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Your Evidence Graph maps how the conclusions in your{" "}
            <span className="font-medium">articles</span> connect to the{" "}
            <span className="font-medium">studies</span> you've saved. Each
            article contains <span className="font-medium">claims</span>, and
            each claim links to the studies it draws on — the link is colored
            by whether that evidence{" "}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              supports
            </span>
            ,{" "}
            <span className="font-semibold text-red-700 dark:text-red-400">
              contradicts
            </span>
            , is{" "}
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              mixed
            </span>
            , or is{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              contextual
            </span>{" "}
            to that claim. Click any node to open the article editor or study
            page.
          </p>
          <ul className="mt-3 text-sm text-gray-600 dark:text-gray-400 list-disc ml-5 space-y-1">
            <li>
              It's private to you — only your own articles, claims, and saved
              studies appear (you may need to{" "}
              <Link
                href="/articles"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                sign in
              </Link>{" "}
              to see it).
            </li>
            <li>
              Start by saving studies from search, then write an article and
              link claims to them in the editor.
            </li>
            <li>
              Layout is computed live with force-directed physics — drag the
              nodes to explore.
            </li>
          </ul>
        </section>

        <EvidenceGraph />
      </div>
    </div>
  );
}