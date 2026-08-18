import { XMLParser } from "fast-xml-parser";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Shared PubMed (NCBI E-utilities) engine.
 *
 * Pipeline: ESearch (get PMIDs) -> EFetch (get XML) -> parse to structured objects.
 * Kept separate from the API routes so search, save-study, and the study detail
 * page can all use identical parsing logic.
 */

export interface PubMedStudy {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  /** ISO date string (yyyy-mm-dd) or null when unknown */
  publicationDate: string | null;
  abstract: string;
  doi?: string;
  /** PubMed Central ID (e.g. "PMC13477667") when the article is in PMC. */
  pmcid?: string | null;
}

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "StudyHub";
const EMAIL = "adam426haziq@gmail.com";

// NCBI asks that we include tool + email in every E-utility request.
// Normal limit without an API key is 3 req/s; a single user search is far below that.
function buildParams(extra: Record<string, string>) {
  return new URLSearchParams({ tool: TOOL, email: EMAIL, ...extra });
}

/** Convert a raw PMID list from ESearch into objects. */
export async function searchPubMed(
  term: string,
  retmax = 10
): Promise<PubMedStudy[]> {
  // ---- Step 1: ESearch -> PMIDs ----
  const searchRes = await fetch(
    `${NCBI_BASE}/esearch.fcgi?${buildParams({
      db: "pubmed",
      term,
      retmode: "json",
      retmax: String(retmax),
    })}`
  );
  if (!searchRes.ok) {
    throw new Error(`NCBI ESearch failed: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  const idList: string[] = searchData.esearchresult?.idlist ?? [];
  if (idList.length === 0) return [];

  // ---- Step 2: EFetch -> raw XML ----
  const fetchRes = await fetch(
    `${NCBI_BASE}/efetch.fcgi?${buildParams({
      db: "pubmed",
      id: idList.join(","),
      retmode: "xml",
    })}`
  );
  if (!fetchRes.ok) {
    throw new Error(`NCBI EFetch failed: ${fetchRes.status}`);
  }

  const xmlText = await fetchRes.text();
  return parsePubmedXml(xmlText);
}

/** Fetch a single study by PMID, live from NCBI. Falls back cleanly if not found. */
export async function fetchPubMedStudyById(pmid: string): Promise<PubMedStudy | null> {
  const fetchRes = await fetch(
    `${NCBI_BASE}/efetch.fcgi?${buildParams({
      db: "pubmed",
      id: pmid,
      retmode: "xml",
    })}`
  );
  if (!fetchRes.ok) {
    throw new Error(`NCBI EFetch failed: ${fetchRes.status}`);
  }

  const xmlText = await fetchRes.text();
  const studies = parsePubmedXml(xmlText);
  return studies[0] ?? null;
}

/**
 * Find the PubMed Central (PMC) ID for a PMID.
 *
 * Reads the PMC ArticleId directly from the PubMed record itself — this is
 * authoritative and lag-free (elink's pubmed_pmc index can lag for newly
 * published articles). Returns null when the article is not in PMC.
 */
export async function findPmcid(pmid: string): Promise<string | null> {
  const study = await fetchPubMedStudyById(pmid);
  return study?.pmcid ?? null;
}

/**
 * Fetch full text from PubMed Central when available (open-access articles).
 * Returns the PMC ID (or null) and a capped plain-text excerpt of the body.
 * The cap controls AI-input cost.
 */
export async function fetchFullText(pmid: string): Promise<{
  pmcid: string | null;
  text: string | null;
}> {
  const pmcid = await findPmcid(pmid);
  if (!pmcid) return { pmcid: null, text: null };

  const fetchRes = await fetch(
    `${NCBI_BASE}/efetch.fcgi?${buildParams({
      db: "pmc",
      id: pmcid,
      retmode: "xml",
    })}`
  );
  if (!fetchRes.ok) return { pmcid, text: null };

  const xmlText = await fetchRes.text();
  return { pmcid, text: parsePmcFullText(xmlText) };
}

const FULL_TEXT_CHAR_LIMIT = 12000;

/** Parse PMC full-text XML into a capped, whitespace-cleaned plain-text excerpt. */
function parsePmcFullText(xmlText: string): string | null {
  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: "_text",
  });

  const parsed = parser.parse(xmlText);
  const body = parsed?.["pmc-articleset"]?.article?.body;
  if (!body) return null;

  const collected = collectText(body).replace(/\s+/g, " ").trim();
  if (!collected) return null;
  return collected.length > FULL_TEXT_CHAR_LIMIT
    ? collected.slice(0, FULL_TEXT_CHAR_LIMIT)
    : collected;
}

/** Recursively collect all text nodes from a parsed XML object tree. */
function collectText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node + " ";
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj._text === "string") return obj._text + " ";
    let out = "";
    for (const key of Object.keys(obj)) {
      if (key.startsWith("@_")) continue; // skip attributes
      out += collectText(obj[key]);
    }
    return out;
  }
  return "";
}

/** Extract a string from a node that may be a plain string, `_text`, or array. */
function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((v) => toText(v)).join("");
  }
  if (value && typeof value === "object" && "_text" in value) {
    return String((value as Record<string, unknown>)._text);
  }
  return "";
}

/** PubMed abstracts can be split into labelled sections (BACKGROUND, METHODS...). */
function parseAbstract(abstractText: unknown): string {
  if (!abstractText) return "No abstract available";
  if (typeof abstractText === "string") return abstractText;

  const parts = Array.isArray(abstractText) ? abstractText : [abstractText];
  const sections = parts.map((part) => {
    const text = toText(part);
    if (part && typeof part === "object") {
      const label = (part as Record<string, unknown>).Label;
      if (typeof label === "string" && label.trim()) {
        return `${label}: ${text}`;
      }
    }
    return text;
  });

  const joined = sections.filter(Boolean).join("\n");
  return joined || "No abstract available";
}

/** Parse the PubMed article XML into clean, structured study objects. */
export function parsePubmedXml(xmlText: string): PubMedStudy[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: "_text",
  });

  const parsedXml = parser.parse(xmlText);

  // PubMed returns a single object for one result; force it into an array.
  let articles = parsedXml.PubmedArticleSet?.PubmedArticle ?? [];
  if (!Array.isArray(articles)) articles = [articles];

  return articles.map((article: Record<string, any>): PubMedStudy => {
    const medline = article.MedlineCitation;
    const articleData = medline?.Article;

    const pmid = toText(medline?.PMID) || "Unknown";

    const title = toText(articleData?.ArticleTitle) || "No title available";

    const abstract = parseAbstract(articleData?.Abstract?.AbstractText);

    const journal = toText(articleData?.Journal?.Title) || "Unknown Journal";

    // Combine LastName + Initials for each author.
    const authorNode = articleData?.AuthorList?.Author;
    let authors = "Unknown Authors";
    if (authorNode) {
      const authorArray = Array.isArray(authorNode) ? authorNode : [authorNode];
      const names = authorArray
        .map((a: Record<string, unknown>) =>
          `${toText(a.LastName)} ${toText(a.Initials)}`.trim()
        )
        .filter((name: string) => name !== "");
      if (names.length > 0) authors = names.join(", ");
    }

    // Prefer full Date when present, fall back to year-only.
    const pubDate = articleData?.Journal?.JournalIssue?.PubDate;
    const year = toText(pubDate?.Year);
    const month = toText(pubDate?.Month);
    const day = toText(pubDate?.Day);
    let publicationDate: string | null = null;
    if (year) {
      const monthNum = monthNumber(month);
      const dayNum = day ? day.padStart(2, "0") : "01";
      if (monthNum) {
        publicationDate = `${year}-${monthNum}-${dayNum}`;
      } else {
        publicationDate = `${year}-01-01`;
      }
    }

    // DOI + PMC ID from the ArticleIdList (may be string or array of objects).
    let doi: string | undefined;
    let pmcid: string | null | undefined;
    const idList =
      article.PubmedData?.ArticleIdList?.ArticleId ?? [];
    const ids = Array.isArray(idList) ? idList : [idList];
    for (const idNode of ids) {
      if (idNode?.["@_IdType"] === "doi" && !doi) {
        doi = toText(idNode);
      }
      if (idNode?.["@_IdType"] === "pmc" && pmcid === undefined) {
        pmcid = toText(idNode) || null;
      }
      if (doi && pmcid !== undefined) break;
    }

    return {
      pmid,
      title,
      authors,
      journal,
      abstract,
      publicationDate,
      doi,
      pmcid,
    };
  });
}

/** Convert month names ("Aug") or numbers ("8") to a zero-padded month string. */
function monthNumber(value: string): string | null {
  const cleaned = value.trim();
  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    if (n >= 1 && n <= 12) return String(n).padStart(2, "0");
    return null;
  }
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  return months[cleaned.slice(0, 3).toLowerCase()] ?? null;
}

/** Search handler wrapper - keeps route files thin and consistent. */
export async function handlePubmedSearch(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const term = searchParams.get("term");
  const retmaxParam = searchParams.get("retmax");

  if (!term) {
    return NextResponse.json({ error: "Missing search term" }, { status: 400 });
  }

  try {
    const retmax = retmaxParam ? parseInt(retmaxParam, 10) : 10;
    const data = await searchPubMed(term, Math.min(Math.max(retmax, 1), 50));
    return NextResponse.json({ data });
  } catch (error) {
    console.error("PubMed search failed:", error);
    return NextResponse.json(
      { error: "NCBI request failed" },
      { status: 502 }
    );
  }
}