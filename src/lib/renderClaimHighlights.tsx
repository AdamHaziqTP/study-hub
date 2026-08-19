import type { ReactNode } from "react";

/**
 * Shared claim-highlight renderer (used by the article editor's live preview
 * and the article read view).
 *
 * Splits `content` into React nodes, wrapping every occurrence of a claim's
 * text in a highlighted <mark> so the user can see exactly where each claim
 * sits inside the article. Clicking a highlight scrolls to that claim's card
 * (element id `claim-<id>`). Claims whose text isn't found verbatim simply
 * aren't highlighted.
 */
export interface HighlightableClaim {
  id: string;
  text: string;
}

export function renderClaimHighlights(
  content: string,
  claims: HighlightableClaim[]
): ReactNode[] {
  const matches: { start: number; end: number; claim: HighlightableClaim }[] = [];
  for (const claim of claims) {
    const text = claim.text.trim();
    if (!text) continue;
    let idx = content.indexOf(text);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + text.length, claim });
      idx = content.indexOf(text, idx + text.length);
    }
  }
  if (matches.length === 0) return [content];

  matches.sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // skip overlaps / duplicates
    if (m.start > cursor) nodes.push(content.slice(cursor, m.start));
    // Don't highlight invisible trailing whitespace (e.g. the space after a
    // period) — render it as plain text after the mark so there's no blocky
    // overhang at the end of a line.
    let visibleEnd = m.end;
    while (visibleEnd > m.start && /\s/.test(content[visibleEnd - 1])) {
      visibleEnd--;
    }
    if (visibleEnd > m.start) {
      nodes.push(
        <mark
          key={`${m.claim.id}-${m.start}`}
          className="bg-amber-200 text-gray-900 dark:bg-amber-500/30 dark:text-amber-100 rounded px-0.5 py-px cursor-pointer hover:bg-amber-300 dark:hover:bg-amber-500/50"
          title="Linked claim — click to see its studies"
          onClick={() =>
            document
              .getElementById(`claim-${m.claim.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          {content.slice(m.start, visibleEnd)}
        </mark>
      );
    }
    if (visibleEnd < m.end) nodes.push(content.slice(visibleEnd, m.end));
    cursor = m.end;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return nodes;
}
