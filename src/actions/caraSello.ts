"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CachudobetConfig,
  CaraSelloJugada,
  CaraSelloSala,
  MetricasCaraSello,
} from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

/**
 * Cara o sello 1v1 (0050). Uno abre la sala eligiendo lado y monto, otro se
 * sienta enfrente con el mismo monto y ahí cae la moneda.
 *
 * El resultado lo decide `unirse_cara_sello` con `random()` de Postgres, en
 * la misma transacción que mueve el saldo de los dos. Ninguno de los dos
 * navegadores decide nada: reciben el duelo ya resuelto y lo animan.
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

const crearSalaSchema = z.object({
  lado: z.enum(["cara", "sello"]),
  monto: z
    .number()
    .positive("El monto debe ser mayor a 0.")
    .max(100000, "Ese monto es demasiado alto.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
});
export type CrearSalaCaraSelloInput = z.infer<typeof crearSalaSchema>;

export interface SalaConJugadores {
  sala: CaraSelloSala;
  creadorNickname: string;
  rivalNickname: string | null;
}

export interface VistaCaraSello {
  /** Salas de otros esperando rival. */
  abiertas: SalaConJugadores[];
  /** La mía esperando, si tengo una. Solo se permite una a la vez. */
  miSala: CaraSelloSala | null;
  /** Mis últimos duelos resueltos, del más nuevo al más viejo. */
  misDuelos: SalaConJugadores[];
  config: CachudobetConfig;
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Nicknames de golpe para todas las salas: una consulta, no una por fila. */
async function conJugadores(
  admin: Admin,
  salas: CaraSelloSala[]
): Promise<SalaConJugadores[]> {
  if (salas.length === 0) return [];

  const ids = [
    ...new Set(
      salas.flatMap((s) => [s.creador_id, s.rival_id]).filter((id): id is string => !!id)
    ),
  ];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nickname")
    .in("id", ids);
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return salas.map((sala) => ({
    sala,
    creadorNickname: nicknamePorId.get(sala.creador_id) ?? "—",
    rivalNickname: sala.rival_id ? (nicknamePorId.get(sala.rival_id) ?? "—") : null,
  }));
}

/** El lobby: contra quién puedo sentarme, qué dejé abierto y cómo me fue. */
export async function getLobbyCaraSello(): Promise<ActionResult<VistaCaraSello>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();

  const [{ data: config, error: errorConfig }, { data: esperando }, { data: duelos }] =
    await Promise.all([
      admin.from("cachudobet_config").select("*").single(),
      admin
        .from("cara_sello_salas")
        .select("*")
        .eq("estado", "esperando")
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("cara_sello_salas")
        .select("*")
        .eq("estado", "resuelta")
        .or(`creador_id.eq.${session.userId},rival_id.eq.${session.userId}`)
        .order("resuelta_at", { ascending: false })
        .limit(10),
    ]);

  if (errorConfig || !config) {
    return { ok: false, error: errorConfig?.message ?? "Falta la configuración de CACHUDOBET." };
  }

  const todas = (esperando ?? []) as CaraSelloSala[];
  const miSala = todas.find((s) => s.creador_id === session.userId) ?? null;
  const deOtros = todas.filter((s) => s.creador_id !== session.userId);

  const [abiertas, misDuelos] = await Promise.all([
    conJugadores(admin, deOtros),
    conJugadores(admin, (duelos ?? []) as CaraSelloSala[]),
  ]);

  return {
    ok: true,
    data: { abiertas, miSala, misDuelos, config: config as CachudobetConfig },
  };
}

/** Abre la mesa y deja el monto retenido esperando rival. */
export async function crearSalaCaraSello(
  input: CrearSalaCaraSelloInput
): Promise<ActionResult<CaraSelloSala>> {
  const parsed = crearSalaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("crear_sala_cara_sello", {
    p_usuario_id: session.userId,
    p_lado: parsed.data.lado,
    p_monto: parsed.data.monto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CaraSelloSala };
}

/**
 * Sentarse enfrente. Devuelve la sala YA RESUELTA: la moneda cayó dentro del
 * RPC, así que lo que llega acá es el resultado, no una promesa.
 */
export async function unirseCaraSello(salaId: string): Promise<ActionResult<CaraSelloSala>> {
  const parsed = z.string().uuid("Sala inválida.").safeParse(salaId);
  if (!parsed.success) return { ok: false, error: "Sala inválida." };

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("unirse_cara_sello", {
    p_usuario_id: session.userId,
    p_sala_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CaraSelloSala };
}

/** Solo mientras nadie se haya sentado: devuelve el monto retenido. */
export async function cancelarSalaCaraSello(
  salaId: string
): Promise<ActionResult<CaraSelloSala>> {
  const parsed = z.string().uuid("Sala inválida.").safeParse(salaId);
  if (!parsed.success) return { ok: false, error: "Sala inválida." };

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("cancelar_sala_cara_sello", {
    p_usuario_id: session.userId,
    p_sala_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CaraSelloSala };
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

/** Admin-only: el historial por jugador. Cada duelo aporta dos filas. */
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
