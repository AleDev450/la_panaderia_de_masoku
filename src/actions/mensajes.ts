"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MensajeSoporte } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

/**
 * Mensajes entre el jugador y el staff (0055).
 *
 * La dirección del mensaje NO viaja desde el cliente: la decide
 * `enviar_mensaje_soporte` mirando el rol del autor. Y un jugador solo puede
 * escribir en su propio hilo aunque mande otro id — el RPC lo ignora.
 */

async function requireSessionUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: "Debes iniciar sesión." };
  return { ok: true, userId: user.id };
}

async function requireAdminId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", session.userId)
    .single();
  if (perfil?.rol !== "admin") return { ok: false, error: "No autorizado." };

  return { ok: true, userId: session.userId };
}

const enviarSchema = z.object({
  /** Solo lo usa el staff; a un jugador el RPC le impone su propio hilo. */
  usuarioId: z.string().uuid("Usuario inválido.").optional(),
  cuerpo: z
    .string()
    .trim()
    .min(1, "Escribe un mensaje.")
    .max(2000, "Máximo 2000 caracteres."),
});
export type EnviarMensajeInput = z.infer<typeof enviarSchema>;

/** Mi conversación con el staff, de la más vieja a la más nueva. */
export async function getMiConversacion(): Promise<ActionResult<MensajeSoporte[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mensajes_soporte")
    .select("*")
    .eq("usuario_id", session.userId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  // Abrir la conversación es haberla leído: se marca acá y no con un botón
  // aparte, que nadie apretaría.
  await admin.rpc("marcar_mensajes_leidos", {
    p_lector_id: session.userId,
    p_usuario_id: session.userId,
  });

  return { ok: true, data: (data ?? []) as MensajeSoporte[] };
}

/** Cuántas respuestas del staff tengo sin leer — para el aviso del menú. */
export async function getMisMensajesSinLeer(): Promise<ActionResult<number>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("mensajes_soporte")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", session.userId)
    .eq("de_staff", true)
    .eq("leido", false);

  return { ok: true, data: count ?? 0 };
}

export async function enviarMensaje(
  input: EnviarMensajeInput
): Promise<ActionResult<MensajeSoporte>> {
  const parsed = enviarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("enviar_mensaje_soporte", {
    p_autor_id: session.userId,
    // Para un jugador esto da igual: el RPC usa su propio id.
    p_usuario_id: parsed.data.usuarioId ?? session.userId,
    p_cuerpo: parsed.data.cuerpo,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as MensajeSoporte };
}

export interface HiloResumen {
  usuarioId: string;
  nickname: string;
  ultimoMensaje: string;
  ultimaFecha: string;
  /** Lo escribió el staff (o sea: ya está contestado). */
  ultimoDeStaff: boolean;
  sinLeer: number;
}

/** Admin-only: la bandeja de entrada, con lo sin contestar primero. */
export async function getHilos(): Promise<ActionResult<HiloResumen[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  // Se traen los mensajes y se agrupa acá: son conversaciones de soporte, no
  // un chat masivo, y armar una vista en Postgres para esto sería más
  // maquinaria de la que el volumen justifica.
  const { data: mensajes, error } = await admin
    .from("mensajes_soporte")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return { ok: false, error: error.message };
  if (!mensajes || mensajes.length === 0) return { ok: true, data: [] };

  const porHilo = new Map<string, { ultimo: MensajeSoporte; sinLeer: number }>();
  for (const m of mensajes as MensajeSoporte[]) {
    const actual = porHilo.get(m.usuario_id);
    // Vienen del más nuevo al más viejo: el primero que se ve es el último.
    if (!actual) porHilo.set(m.usuario_id, { ultimo: m, sinLeer: 0 });
    if (!m.de_staff && !m.leido) {
      porHilo.get(m.usuario_id)!.sinLeer += 1;
    }
  }

  const ids = [...porHilo.keys()];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nickname")
    .in("id", ids);
  const nick = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  const hilos = ids.map((id) => {
    const { ultimo, sinLeer } = porHilo.get(id)!;
    return {
      usuarioId: id,
      nickname: nick.get(id) ?? "—",
      ultimoMensaje: ultimo.cuerpo,
      ultimaFecha: ultimo.created_at,
      ultimoDeStaff: ultimo.de_staff,
      sinLeer,
    };
  });

  // Lo que espera respuesta va arriba; después, lo más reciente.
  hilos.sort(
    (a, b) =>
      b.sinLeer - a.sinLeer ||
      new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime()
  );

  return { ok: true, data: hilos };
}

/** Admin-only: el hilo completo de un jugador. Lo marca leído al abrirlo. */
export async function getHilo(usuarioId: string): Promise<ActionResult<MensajeSoporte[]>> {
  const parsed = z.string().uuid("Usuario inválido.").safeParse(usuarioId);
  if (!parsed.success) return { ok: false, error: "Usuario inválido." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mensajes_soporte")
    .select("*")
    .eq("usuario_id", parsed.data)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  await admin.rpc("marcar_mensajes_leidos", {
    p_lector_id: session.userId,
    p_usuario_id: parsed.data,
  });

  return { ok: true, data: (data ?? []) as MensajeSoporte[] };
}
