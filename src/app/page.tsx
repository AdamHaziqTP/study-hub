"use client";

import { useState } from "react";
import Link from "next/link";
import AuthStatus from "@/components/AuthStatus";

interface Study {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  publicationDate: string | null;
  abstract: string;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Study[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/search-pubmed?term=${encodeURIComponent(query)}`);
      const json = await res.json();
      setResults(json.data || []);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Added min-h-screen and explicit background/text colors to override system dark mode
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Evidence Hub</h1>
          <div className="flex items-center gap-4">
            <AuthStatus />
            <Link
              href="/library"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Library →
            </Link>
            <Link
              href="/articles"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              My Articles →
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-4 mb-10">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercise science literature..." 
            // Explicitly set bg-white and text-black
            className="flex-1 border border-gray-300 bg-white rounded-lg p-4 text-black text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          <button 
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? "Searching NLM..." : "Search PubMed"}
          </button>
        </form>

        {/* Results Grid */}
        <div className="flex flex-col gap-6">
          {results.map((study) => (
            <div key={study.pmid} className="border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
              <Link href={`/study/${study.pmid}`}>
                <h2 className="text-xl font-semibold mb-2 text-gray-900 leading-snug hover:text-blue-700 transition-colors">
                  {study.title}
                </h2>
              </Link>
              <div className="text-sm text-gray-500 mb-4 font-medium">
                {study.authors} • <span className="italic">{study.journal}</span> ({study.publicationDate?.slice(0, 4) ?? "Unknown year"}) • PMID: {study.pmid}
              </div>
              <p className="text-gray-700 text-sm line-clamp-3 mb-4 leading-relaxed">
                {study.abstract}
              </p>
              <div className="flex justify-end">
                <Link
                  href={`/study/${study.pmid}`}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  View Study →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}