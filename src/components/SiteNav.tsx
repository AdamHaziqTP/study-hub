"use client";

import Link from "next/link";
import AuthStatus from "./AuthStatus";
import ThemeToggle from "./ThemeToggle";

/**
 * SiteNav — the shared header navigation used on the main pages.
 *
 * Renders the cross-site links (Library / My Articles / Evidence Graph, plus
 * an optional "Back to search") as pill buttons with icons, together with the
 * theme toggle and sign-in control. Cleaner than bare "text →" links and keeps
 * the redirects consistent across every page (each page also has a Library
 * link, which the article/graph pages were previously missing).
 */
export default function SiteNav({ backToSearch = false }: { backToSearch?: boolean }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Site navigation">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        Library
      </Link>
      <Link
        href="/articles"
        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        My Articles
      </Link>
      <Link
        href="/graph"
        className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8-7M15.4 6.5l1.2 1M9 10l-1.5 1" />
        </svg>
        Evidence Graph
      </Link>
      {backToSearch && (
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to search
        </Link>
      )}
      <ThemeToggle />
      <AuthStatus />
    </nav>
  );
}
