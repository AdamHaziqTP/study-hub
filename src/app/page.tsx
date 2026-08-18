import type { Metadata } from "next";
import HomeSearch from "./HomeSearch";

/**
 * Home page — search entry point of the Explorer.
 *
 * Server shell so the route can export Next.js `metadata` (Task 12 polish);
 * the actual search UI is the client component <HomeSearch>.
 */
export const metadata: Metadata = {
  title: "Search exercise science research",
  description:
    "Search PubMed's exercise-science literature with Study Hub. Ranked results, raw abstracts first, then AI-powered study breakdowns, plain-English explanations, and evidence context.",
  openGraph: {
    type: "website",
    url: "/",
    title: "Study Hub — Search exercise science research",
    description:
      "Search PubMed's exercise-science literature with Study Hub. Ranked results, raw abstracts first, then AI-powered study breakdowns, plain-English explanations, and evidence context.",
  },
};

export default function Home() {
  return <HomeSearch />;
}