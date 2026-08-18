import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser Supabase client with automatic cookie-based session handling
 * (via @supabase/ssr's createBrowserClient).
 *
 * Used on the client for:
 *   - GitHub OAuth sign-in / sign-out
 *   - Reading the signed-in user's session
 *   - Reading/writing the user's OWN study_notes rows (RLS enforces that
 *     auth.uid() = user_id — the user_id column actually DEFAULTS to
 *     auth.uid() in the DB, so the client never sends it).
 *
 * The public `studies` / `study_context` library keeps using the shared
 * anon client in src/lib/supabase.ts for server-side route handlers.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}