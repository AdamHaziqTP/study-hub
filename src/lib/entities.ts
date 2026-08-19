/**
 * Task 23 — HTML entity decoding (roadmap item #9).
 *
 * PubMed abstracts/titles frequently carry HTML character references (e.g.
 * `&#xb0;` for the degree sign, `&lt;` for `<`, `&micro;` for µ). React renders
 * a string variable's contents literally — it does NOT decode entities inside a
 * plain string — so those escape codes would show to the user verbatim. This
 * pure helper decodes numeric (decimal + hex) and common named entities to
 * their proper Unicode characters.
 *
 * It is a PURE function (no DOM/DOMParser), so it runs identically on the
 * server (SSR) and the client — applying it in a component body therefore
 * cannot cause a hydration mismatch.
 */

/** Common named entities seen in biomedical/scientific text. */
const NAMED_ENTITIES: Record<string, string> = {
  // Basic XML/HTML
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  // Dashes / punctuation
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  laquo: "\u00ab",
  raquo: "\u00bb",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  // Math / units
  deg: "\u00b0",
  plusmn: "\u00b1",
  minus: "\u2212",
  times: "\u00d7",
  divide: "\u00f7",
  micro: "\u00b5",
  le: "\u2264",
  ge: "\u2265",
  ne: "\u2260",
  asymp: "\u2248",
  radic: "\u221a",
  infin: "\u221e",
  sup2: "\u00b2",
  sup3: "\u00b3",
  // Common Greek letters (scientific notation)
  alpha: "\u03b1",
  beta: "\u03b2",
  gamma: "\u03b3",
  delta: "\u03b4",
  epsilon: "\u03b5",
  theta: "\u03b8",
  mu: "\u03bc",
  pi: "\u03c0",
  rho: "\u03c1",
  sigma: "\u03c3",
  tau: "\u03c4",
  phi: "\u03c6",
  omega: "\u03c9",
};

/** Return the char for a code point, or U+FFFD if it's an invalid/control ref. */
function safeFromCodePoint(cp: number): string {
  if (
    cp === 0 ||
    cp > 0x10ffff ||
    (cp >= 0xd800 && cp <= 0xdfff) ||
    (cp >= 0x80 && cp <= 0x9f) // C1 control range
  ) {
    return "\uFFFD";
  }
  return String.fromCodePoint(cp);
}

/**
 * Decode HTML numeric and named character references in `input` to their
 * Unicode characters. Unknown named entities are left untouched.
 */
export function decodeEntities(input: string): string {
  if (!input) return input;
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      safeFromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      safeFromCodePoint(parseInt(dec, 10))
    )
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) => {
      const replacement = NAMED_ENTITIES[name];
      return replacement === undefined ? match : replacement;
    });
}
