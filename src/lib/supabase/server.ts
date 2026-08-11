import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Database } from "@/lib/supabase/types";

/**
 * Server-side Supabase client bound to the current user's session (anon
 * key + auth cookies). Use this for reads that must respect RLS as the
 * logged-in user — e.g. "my bets", "my balance".
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component with no request context to
            // mutate — safe to ignore when middleware refreshes sessions.
          }
        },
      },
    }
  );
}
