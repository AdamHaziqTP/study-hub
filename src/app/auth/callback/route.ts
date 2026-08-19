import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * OAuth redirect target (GitHub AND Google, Task 27). Supabase's PKCE flow
 * lands here with:
 *   ?code=...     the one-time authorization code
 *   ?next=...     the URL the user should return to (default "/")
 *
 * We exchange the code for a session using a server-side client (the PKCE
 * code verifier cookie is sent with this request automatically), which
 * writes the session cookies onto the response via setAll. The user is then
 * redirected back to `next`.
 *
 * This route is provider-agnostic — `exchangeCodeForSession` accepts the
 * one-time code from any enabled OAuth provider — so no provider-specific
 * handling is needed here.
 *
 * This route MUST NOT be cached (it sets auth cookies); @supabase/ssr
 * sets the appropriate Cache-Control headers via Response.cookies.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  const response = NextResponse.redirect(requestUrl.origin + next);

  if (!code) {
    // Missing code - no session to exchange. Send the user back home.
    return response;
  }

  try {
    const supabase = createServerSupabaseClient(request, response);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("OAuth code exchange failed:", error.message);
      // Fall through - redirect home without a session.
    }
  } catch (err) {
    console.error("OAuth callback error:", err);
  }

  return response;
}