import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresca la cookie de sesión de Supabase en cada request. Es lo que
 * permite que las lecturas de src/lib/supabase/server.ts (todas las Server
 * Actions: requireSessionUserId, getMisApuestasConEvento, crearEvento,
 * las de perfil…) vean una sesión válida: un Server Component no puede
 * escribir cookies, así que sin este refresco el access token expira
 * (~1 h) y esas acciones empiezan a responder "Debes iniciar sesión".
 * No hace nada si Supabase todavía no está configurado.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Todas las rutas de la app menos assets estáticos. Antes esto solo
  // cubría "/exchange/:path*", que era correcto cuando esa era la única
  // pantalla con Server Actions; hoy /partidas, /mis-apuestas, /historial,
  // /perfil y /bakery también dependen de la sesión del servidor, así que
  // dejarlas fuera hacía que su token expirara sin refrescarse.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp3)$).*)",
  ],
};
