"use client";

/**
 * Task 19 — Empty state UI for the home search screen (roadmap item #11).
 *
 * Rendered when no search has been run yet. Instead of a bare blank page under
 * the search bar, this onboarding card explains what Study Hub is, offers
 * clickable example questions that kick off a real search, and points to the
 * Library + Evidence Notebook so a first-time visitor knows what to do with
 * results. The same `EXAMPLE_QUERIES` list is reused by the zero-results state
 * in `HomeSearch` as quick "try this instead" recovery chips.
 */

export interface ExampleQuery {
  /** Short chip label shown on the button. */
  label: string;
  /** The natural-language query actually sent to `/api/ai-search`. */
  query: string;
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    label: "Training frequency",
    query: "how many times a week should I train?",
  },
  {
    label: "Triceps arm position",
    query: "overhead vs neutral arm position for triceps growth",
  },
  {
    label: "Protein intake",
    query: "how much protein per day to build muscle?",
  },
  {
    label: "Rep ranges",
    query: "high rep vs low rep for muscle growth",
  },
];

export default function EmptySearchState({
  onExample,
}: {
  /** Run a real search for the given query (used by the example chips). */
  onExample: (query: string) => void;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-bold text-gray-900">What is Study Hub?</h2>
      <p className="mt-3 text-gray-700 leading-relaxed">
        Study Hub helps evidence-curious lifters search, read, and critically
        interpret exercise-science research. Ask a question below (or tap an
        example) to get relevance-ranked PubMed results — each study opens with
        the raw abstract first, followed by AI-powered breakdowns, plain-English
        explanations, and evidence context.
      </p>

      <div className="mt-6">
        <p className="text-sm font-semibold text-gray-800 mb-2">
          Try one of these questions
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex.query}
              type="button"
              onClick={() => onExample(ex.query)}
              className="inline-flex items-center gap-1.5 border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-blue-100 hover:border-blue-300 transition-colors"
            >
              {ex.label} →
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-600 leading-relaxed">
        <p>
          Found something useful?{" "}
          <span className="font-medium text-gray-800">Save it to your Library</span>{" "}
          for later, add{" "}
          <span className="font-medium text-gray-800">personal notes</span> on
          the study page, and collect your evidence-backed conclusions in the{" "}
          <span className="font-medium text-gray-800">Evidence Notebook</span>.
        </p>
      </div>
    </div>
  );
}
