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
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans dark:bg-gray-950 dark:text-gray-100">
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

        <EvidenceGraph />
      </div>
    </div>
  );
}