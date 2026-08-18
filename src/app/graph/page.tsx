import AuthStatus from "@/components/AuthStatus";
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
export const dynamic = "force-dynamic";

export default function GraphPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Evidence Graph</h1>
          <div className="flex items-center gap-4">
            <AuthStatus />
            <Link
              href="/articles"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              My Articles →
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
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