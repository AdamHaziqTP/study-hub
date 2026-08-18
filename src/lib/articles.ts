export type EvidenceRelationship = "supports" | "contradicts" | "mixed" | "contextual";

export const RELATIONSHIP_LABELS: Record<EvidenceRelationship, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  mixed: "Mixed",
  contextual: "Contextual",
};

export const RELATIONSHIP_COLORS: Record<EvidenceRelationship, string> = {
  supports: "bg-green-100 text-green-800",
  contradicts: "bg-red-100 text-red-800",
  mixed: "bg-amber-100 text-amber-800",
  contextual: "bg-blue-100 text-blue-800",
};

/**
 * Hex equivalents of RELATIONSHIP_COLORS for SVG rendering (the evidence
 * graph uses these directly in <line>/<path> stroke attributes, where Tailwind
 * classes don't apply). Deliberately 600-level shades so edges read clearly on
 * a white background.
 */
export const RELATIONSHIP_HEX: Record<EvidenceRelationship, string> = {
  supports: "#16a34a", // green-600
  contradicts: "#dc2626", // red-600
  mixed: "#d97706", // amber-600
  contextual: "#2563eb", // blue-600
};

/** A study the user can link to a claim (from the shared `studies` library). */
export interface LinkableStudy {
  id: string;
  pmid: string;
  title: string;
  journal: string | null;
}

/** An evidence link attached to a claim (draft or saved). */
export interface DraftLink {
  /** Local React key (crypto.randomUUID) — NOT the DB id. */
  key: string;
  /** DB evidence_links.id when already saved (null for a new link). */
  id: string | null;
  studyId: string;
  studyTitle: string;
  studyPmid: string;
  relationship: EvidenceRelationship;
}

/** A claim inside the editor (draft or saved). */
export interface DraftClaim {
  key: string;
  /** DB claims.id when already saved (null for a new claim). */
  id: string | null;
  text: string;
  links: DraftLink[];
}

export interface ArticleDraft {
  /** DB articles.id when editing (null when creating). */
  id: string | null;
  title: string;
  content: string;
  claims: DraftClaim[];
}