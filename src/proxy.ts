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
/**
 * IPs bloqueadas a mano, desde la variable de entorno `IPS_BLOQUEADAS`
 * (separadas por coma). Para banear una IP que ataca con un script: agrégala
 * ahí y reinicia el contenedor. Se corta ANTES de cualquier trabajo de
 * sesión/base, así que un atacante bloqueado ni siquiera toca Supabase.
 *
 * OJO: detrás de un reverse proxy (nginx/traefik/Cloudflare) la IP real
 * llega en `x-forwarded-for` — esto la lee de ahí. Si ese proxy NO reenvía
 * la IP real, este bloqueo ve la IP del proxy, no la del atacante; en ese
 * caso hay que bloquear en el proxy/firewall del host. Y como `x-forwarded-for`
 * se puede falsificar si nada lo sobreescribe, el bloqueo de red (ufw/iptables
 * en el servidor) siempre es más fuerte que este.
 */
const IPS_BLOQUEADAS = new Set(
  (process.env.IPS_BLOQUEADAS ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
);

function ipDelRequest(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export async function proxy(request: NextRequest) {
  if (IPS_BLOQUEADAS.size > 0) {
    const ip = ipDelRequest(request);
    if (ip && IPS_BLOQUEADAS.has(ip)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

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
