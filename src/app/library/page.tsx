import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import LibraryLoader from "./LibraryLoader";

/**
 * Library page — the SIGNED-IN user's own saved studies.
 *
 * The Library is per-account (`user_saved_studies`), so the data is loaded
 * client-side via the @supabase/ssr browser client (RLS filters to auth.uid())
 * in <LibraryLoader>, which shows a login CTA when not signed in. This shell
 * only provides the page metadata + header + nav.
 */
export const metadata: Metadata = {
  title: "Library",
  description:
    "Your saved exercise-science studies — the private library of PubMed records you've bookmarked on Study Hub.",
  openGraph: {
    type: "website",
    url: "/library",
    title: "Library | Study Hub",
    description:
      "Your saved exercise-science studies — the private library of PubMed records you've bookmarked on Study Hub.",
  },
};

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans dark:bg-gray-950 dark:text-gray-100 overflow-x-clip">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Library</h1>
          <SiteNav backToSearch />
        </div>

        <LibraryLoader />
      </div>
    </div>
  );
}
