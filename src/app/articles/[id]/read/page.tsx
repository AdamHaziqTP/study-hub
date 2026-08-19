import type { Metadata } from "next";
import ArticleReader from "./ArticleReader";

/**
 * /articles/[id]/read — read-only view of an article (Task: Read).
 *
 * Renders the full article (title + content) then the highlighted claims with
 * their linked studies, so a reader can follow the reasoning and open any
 * supporting/contradicting study. This is also the future-proofed "share an
 * article" view — no edit controls, just reading.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Read article",
    description: `Reading an article on Study Hub (article ${id}).`,
  };
}

export default async function ArticleReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArticleReader articleId={id} />;
}
