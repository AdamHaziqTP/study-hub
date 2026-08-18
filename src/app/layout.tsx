import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * App-wide metadata (Task 12 polish): a real title + description + Open Graph
 * fallback for the whole site. Per-page metadata (home/library/articles/graph/
 * study) overrides `title` + `description` where it makes sense; openGraph
 * fields without a page-level override inherit this template.
 *
 * metadataBase: URL-based fields (canonical, og:url) can use relative paths.
 * title.template: pages that export `title: "Foo"` get "Foo | Study Hub".
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://study-hub-rho-drab.vercel.app"),
  title: {
    default: "Study Hub — Understand exercise science research",
    template: "%s | Study Hub",
  },
  description:
    "Search, read, and critically interpret exercise-science research. Raw PubMed abstracts first, then AI-powered plain-English explanations, evidence context, and cautious training applications.",
  openGraph: {
    type: "website",
    siteName: "Study Hub",
    title: "Study Hub — Understand exercise science research",
    description:
      "Search, read, and critically interpret exercise-science research. Raw PubMed abstracts first, then AI-powered plain-English explanations, evidence context, and cautious training applications.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Study Hub — Understand exercise science research",
    description:
      "Search, read, and critically interpret exercise-science research. Raw PubMed abstracts first, then AI-powered plain-English explanations, evidence context, and cautious training applications.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
