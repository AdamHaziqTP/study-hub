import ArticleEditor from "./ArticleEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * /articles/[id] — article editor (Task 7).
 *
 * The article itself is private (RLS-locked to auth.uid()), so all data is
 * loaded client-side via the @supabase/ssr browser client (which carries the
 * user's session cookies). The editor handles:
 *   - editing title + content,
 *   - adding/editing/deleting claims,
 *   - linking each claim to saved studies (supports/contradicts/mixed/contextual),
 *   - saving the whole article in one go.
 */
export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: PageProps) {
  const { id } = await params;
  return <ArticleEditor articleId={id} />;
}