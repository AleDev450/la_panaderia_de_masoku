import "server-only";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";

/**
 * service_role client — bypasses RLS entirely. NEVER import this from a
 * Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 * `import "server-only"` makes any accidental client-side import a build
 * error instead of a leaked secret.
 *
 * Used exclusively to invoke the SECURITY DEFINER RPCs (crear_apuesta,
 * cancelar_apuesta, resolver_evento) from Server Actions, per the spec:
 * matching and settlement are never computed in JS, only delegated to
 * Postgres.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
