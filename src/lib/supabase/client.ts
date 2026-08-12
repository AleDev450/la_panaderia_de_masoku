import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/lib/supabase/types";

/**
 * Browser-side Supabase client (anon key). Usado por el login de /bakery
 * para autenticar contra Supabase Auth en vez del mock de userService.ts.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
