"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CaraSelloJugada, MetricasCaraSello } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

/**
 * Cara o sello (0049). El resultado NO se decide acá: `jugar_cara_sello` lo
 * saca de `random()` en Postgres, dentro de la misma transacción que descuenta
 * y paga. Esta función solo valida la entrada y devuelve la jugada ya
 * resuelta para que el cliente la anime.
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

const jugarSchema = z.object({
  eleccion: z.enum(["cara", "sello"]),
  monto: z
    .number()
    .positive("El monto debe ser mayor a 0.")
    .max(100000, "Ese monto es demasiado alto.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
});
export type JugarCaraSelloInput = z.infer<typeof jugarSchema>;

/** El mínimo y el máximo reales los impone `jugar_cara_sello` leyendo la
 * config: replicarlos acá los dejaría desincronizados en cuanto el admin los
 * cambie. */
export async function jugarCaraSello(
  input: JugarCaraSelloInput
): Promise<ActionResult<CaraSelloJugada>> {
  const parsed = jugarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("jugar_cara_sello", {
    p_usuario_id: session.userId,
    p_eleccion: parsed.data.eleccion,
    p_monto: parsed.data.monto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CaraSelloJugada };
}

/** Las últimas jugadas de quien pide, para la tira de resultados recientes. */
export async function getMisJugadas(): Promise<ActionResult<CaraSelloJugada[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cara_sello_jugadas")
    .select("*")
    .eq("usuario_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CaraSelloJugada[] };
}

export async function getMetricasCaraSello(): Promise<ActionResult<MetricasCaraSello>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_metricas_cara_sello", {
    p_admin_id: session.userId,
  });

  if (error) return { ok: false, error: error.message };
  const fila = (data ?? [])[0] as MetricasCaraSello | undefined;
  return {
    ok: true,
    data: fila ?? {
      jugadas: 0,
      jugadores: 0,
      monto_apostado: 0,
      monto_pagado: 0,
      resultado_casa: 0,
      jugadas_ganadas: 0,
      jugadas_perdidas: 0,
      salio_cara: 0,
      salio_sello: 0,
    },
  };
}

export interface JugadaConUsuario {
  jugada: CaraSelloJugada;
  nickname: string;
}

/** Admin-only: el historial completo, con quién jugó cada mano. */
export async function getHistorialCaraSello(): Promise<ActionResult<JugadaConUsuario[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: jugadas, error } = await admin
    .from("cara_sello_jugadas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: error.message };
  if (!jugadas || jugadas.length === 0) return { ok: true, data: [] };

  const usuarioIds = [...new Set(jugadas.map((j) => j.usuario_id))];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nickname")
    .in("id", usuarioIds);
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: (jugadas as CaraSelloJugada[]).map((jugada) => ({
      jugada,
      nickname: nicknamePorId.get(jugada.usuario_id) ?? "—",
    })),
  };
}
