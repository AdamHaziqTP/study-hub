import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-compatible Supabase client (anon/public key).
 *
 * Used only for reads and INSERTs into the public `studies` library.
 * Writes to user-owned tables must go through a server-side client
 * with proper auth once accounts are implemented.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);