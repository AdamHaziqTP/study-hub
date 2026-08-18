import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const term = searchParams.get("term");

  if (!term) {
    return NextResponse.json({ error: "Missing search term" }, { status: 400 });
  }

  // ==========================================
  // PART 1: ESEARCH (Get the PMIDs)
  // ==========================================
  const searchUrlParams = new URLSearchParams({
    db: "pubmed",
    term: term,
    retmode: "json",
    retmax: "10",
    tool: "StudyHub",
    email: "adam426haziq@gmail.com",
  });

  const searchRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchUrlParams}`
  );

  if (!searchRes.ok) return NextResponse.json({ error: "NCBI ESearch failed" }, { status: 502 });

  const searchData = await searchRes.json();
  const idList = searchData.esearchresult?.idlist || [];

  if (idList.length === 0) return NextResponse.json({ data: [] });

  // ==========================================
  // PART 2: EFETCH (Get the Study XML)
  // ==========================================
  const fetchUrlParams = new URLSearchParams({
    db: "pubmed",
    id: idList.join(","),
    retmode: "xml",
    tool: "StudyHub",
    email: "adam426haziq@gmail.com",
  });

  const fetchRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${fetchUrlParams}`
  );

  if (!fetchRes.ok) return NextResponse.json({ error: "NCBI EFetch failed" }, { status: 502 });

  const xmlText = await fetchRes.text();

  // ==========================================
  // PART 3: PARSE XML TO CLEAN JSON (New!)
  // ==========================================
  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: "_text",
  });
  
  const parsedXml = parser.parse(xmlText);
  
  // Navigate through the XML tree to get the array of articles
  // Sometimes PubMed returns a single object instead of an array if there's only 1 result, so we force it into an array
  let articles = parsedXml.PubmedArticleSet?.PubmedArticle || [];
  if (!Array.isArray(articles)) articles = [articles];

  const cleanStudies = articles.map((article: any) => {
    const medline = article.MedlineCitation;
    const articleData = medline?.Article;

    // 1. Get PMID
    const pmid = medline?.PMID?._text || medline?.PMID || "Unknown";

    // 2. Get Title
    const title = articleData?.ArticleTitle || "No title available";

    // 3. Get Abstract (PubMed abstracts can be strings or arrays of sections)
    let abstract = "No abstract available";
    if (articleData?.Abstract?.AbstractText) {
      const absData = articleData.Abstract.AbstractText;
      if (typeof absData === "string") abstract = absData;
      else if (Array.isArray(absData)) abstract = absData.map((a: any) => a._text || a).join("\n");
      else if (absData._text) abstract = absData._text;
    }

    // 4. Get Journal
    const journal = articleData?.Journal?.Title || "Unknown Journal";

    // 5. Get Authors (Combine Last Name and Initials)
    let authors = "Unknown Authors";
    if (articleData?.AuthorList?.Author) {
      let authorArray = articleData.AuthorList.Author;
      if (!Array.isArray(authorArray)) authorArray = [authorArray];
      
      authors = authorArray
        .map((a: any) => `${a.LastName || ""} ${a.Initials || ""}`.trim())
        .filter((a: string) => a !== "")
        .join(", ");
    }

    // 6. Get Date (Year)
    const pubDate = articleData?.Journal?.JournalIssue?.PubDate;
    const year = pubDate?.Year || "Unknown Year";

    // Return the clean object matching your database schema
    return {
      pmid,
      title,
      authors,
      journal,
      publication_date: year,
      abstract,
    };
  });

  // Return the beautifully parsed array to the browser
  return NextResponse.json({ data: cleanStudies });
}