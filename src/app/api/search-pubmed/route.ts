import type { NextRequest } from "next/server";
import { handlePubmedSearch } from "@/lib/pubmed";

export async function GET(request: NextRequest) {
  return handlePubmedSearch(request);
}
