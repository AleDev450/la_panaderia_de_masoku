"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CachudobetConfig,
  RuletaRonda,
  RuletaTicket,
} from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

/**
 * Ruleta CACHUDOBET (0048). Igual que el resto del proyecto: acá no se
 * calcula plata ni se elige ganador — se valida la entrada, se resuelve quién
 * llama desde la cookie de sesión y se delega en los RPC de Postgres.
 *
 * Todas las lecturas devuelven además `servidorAhora`, el `now()` de Postgres.
 * Es lo que le permite al cliente medir la animación contra el mismo reloj que
 * fijó `giro_inicia_en` en vez de contra el suyo.
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

const comprarTicketsSchema = z.object({
  rondaId: z.string().uuid("Ronda inválida."),
  monto: z
    .number()
    .positive("El monto debe ser mayor a 0.")
    .max(100000, "Ese monto es demasiado alto.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
});
export type ComprarTicketsInput = z.infer<typeof comprarTicketsSchema>;

const guardarRondaSchema = z.object({
  rondaId: z.string().uuid().nullable().optional(),
  nombre: z.string().trim().min(3, "Ponle un nombre a la ronda.").max(120, "Máximo 120 caracteres."),
  premioConcepto: z.string().trim().max(200, "Máximo 200 caracteres.").optional(),
});
export type GuardarRondaInput = z.infer<typeof guardarRondaSchema>;

const cambiarEstadoSchema = z.object({
  rondaId: z.string().uuid("Ronda inválida."),
  estado: z.enum(["abierta", "cerrada"]),
});
export type CambiarEstadoRondaInput = z.infer<typeof cambiarEstadoSchema>;

const agregarTicketsSchema = z.object({
  rondaId: z.string().uuid("Ronda inválida."),
  usuarioId: z.string().uuid("Jugador inválido."),
  cantidad: z
    .number()
    .int("La cantidad es un número entero.")
    .min(1, "Al menos un ticket.")
    .max(500, "Máximo 500 tickets por operación."),
});
export type AgregarTicketsInput = z.infer<typeof agregarTicketsSchema>;

const guardarConfigSchema = z.object({
  precioTicket: z.number().positive("El precio del ticket debe ser mayor a 0."),
  porcentajePremio: z
    .number()
    .min(0, "El porcentaje va entre 0 y 100.")
    .max(100, "El porcentaje va entre 0 y 100."),
  caraSelloMultiplicador: z.number().gt(1, "El multiplicador debe ser mayor a 1."),
  caraSelloMin: z.number().positive("El mínimo debe ser mayor a 0."),
  caraSelloMax: z.number().positive("El máximo debe ser mayor a 0."),
});
export type GuardarConfigInput = z.infer<typeof guardarConfigSchema>;

export interface ParticipanteRonda {
  usuarioId: string;
  nickname: string;
  tickets: number;
}

export interface GanadorRonda {
  usuarioId: string;
  nickname: string;
  codigo: string;
}

export interface RondaResumen {
  ronda: RuletaRonda;
  /** Ordenados por su primer ticket: la rueda tiene que quedar igual en
   * todas las pantallas, así que el orden no puede depender de un Map. */
  participantes: ParticipanteRonda[];
  totalTickets: number;
  ganador: GanadorRonda | null;
}

export interface VistaRuleta {
  ronda: RondaResumen | null;
  config: CachudobetConfig;
  /** Tickets de quien pide, en la ronda que se está mostrando. */
  misTickets: number;
  /** `now()` de Postgres: el reloj contra el que se mide la animación. */
  servidorAhora: string;
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** El `now()` de Postgres, con el reloj de Node como red de seguridad si el
 * RPC todavía no existe (migración sin correr). */
async function servidorAhora(admin: Admin): Promise<string> {
  const { data } = await admin.rpc("ahora_servidor");
  return typeof data === "string" ? data : new Date().toISOString();
}

/** Arma participantes + ganador de una ronda. Una sola pasada por los tickets:
 * son muchas filas (una por ticket) y esto corre en cada poll. */
async function resumenDeRonda(admin: Admin, ronda: RuletaRonda): Promise<RondaResumen> {
  const { data: tickets } = await admin
    .from("ruleta_tickets")
    .select("id, usuario_id, numero, codigo")
    .eq("ronda_id", ronda.id)
    .order("numero", { ascending: true });

  const filas = tickets ?? [];
  const conteo = new Map<string, number>();
  for (const t of filas) {
    conteo.set(t.usuario_id, (conteo.get(t.usuario_id) ?? 0) + 1);
  }

  const usuarioIds = [...conteo.keys()];
  if (ronda.ganador_usuario_id && !conteo.has(ronda.ganador_usuario_id)) {
    usuarioIds.push(ronda.ganador_usuario_id);
  }

  const { data: perfiles } = usuarioIds.length
    ? await admin.from("perfiles").select("id, nickname").in("id", usuarioIds)
    : { data: [] };
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  // El orden lo da el primer ticket de cada uno, que es el orden en que
  // aparecieron: estable y reproducible en cualquier navegador.
  const participantes: ParticipanteRonda[] = [];
  const vistos = new Set<string>();
  for (const t of filas) {
    if (vistos.has(t.usuario_id)) continue;
    vistos.add(t.usuario_id);
    participantes.push({
      usuarioId: t.usuario_id,
      nickname: nicknamePorId.get(t.usuario_id) ?? "—",
      tickets: conteo.get(t.usuario_id) ?? 0,
    });
  }

  const ticketGanador = ronda.ganador_ticket_id
    ? filas.find((t) => t.id === ronda.ganador_ticket_id)
    : null;

  return {
    ronda,
    participantes,
    totalTickets: filas.length,
    ganador:
      ronda.ganador_usuario_id && ticketGanador
        ? {
            usuarioId: ronda.ganador_usuario_id,
            nickname: nicknamePorId.get(ronda.ganador_usuario_id) ?? "—",
            codigo: ticketGanador.codigo,
          }
        : null,
  };
}

/**
 * La ronda que le toca ver al jugador: la que está en juego y, si no hay
 * ninguna, la última finalizada — para que el ganador siga en pantalla un
 * rato después del giro en vez de desaparecer.
 */
export async function getRuleta(): Promise<ActionResult<VistaRuleta>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();

  const [{ data: config, error: errorConfig }, ahora] = await Promise.all([
    admin.from("cachudobet_config").select("*").single(),
    servidorAhora(admin),
  ]);
  if (errorConfig || !config) {
    return { ok: false, error: errorConfig?.message ?? "Falta la configuración de CACHUDOBET." };
  }

  const { data: enJuego, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    .in("estado", ["abierta", "cerrada", "girando"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { ok: false, error: error.message };

  let ronda = (enJuego ?? [])[0] as RuletaRonda | undefined;
  if (!ronda) {
    const { data: ultima } = await admin
      .from("ruleta_rondas")
      .select("*")
      .eq("estado", "finalizada")
      .order("finalizada_at", { ascending: false })
      .limit(1);
    ronda = (ultima ?? [])[0] as RuletaRonda | undefined;
  }

  if (!ronda) {
    return {
      ok: true,
      data: { ronda: null, config: config as CachudobetConfig, misTickets: 0, servidorAhora: ahora },
    };
  }

  const resumen = await resumenDeRonda(admin, ronda);
  const misTickets =
    resumen.participantes.find((p) => p.usuarioId === session.userId)?.tickets ?? 0;

  return {
    ok: true,
    data: { ronda: resumen, config: config as CachudobetConfig, misTickets, servidorAhora: ahora },
  };
}

/** Compra con saldo. El monto tiene que ser múltiplo exacto del precio del
 * ticket — lo revalida `comprar_tickets_ruleta`, esto es solo el mensaje
 * rápido. */
export async function comprarTickets(
  input: ComprarTicketsInput
): Promise<ActionResult<RuletaTicket[]>> {
  const parsed = comprarTicketsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("comprar_tickets_ruleta", {
    p_usuario_id: session.userId,
    p_ronda_id: parsed.data.rondaId,
    p_monto: parsed.data.monto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as RuletaTicket[] };
}

export interface RondaAdmin {
  ronda: RuletaRonda;
  totalTickets: number;
  participantes: number;
}

/** Admin-only: todas las rondas, con lo que se necesita para la lista. */
export async function getRondas(): Promise<ActionResult<RondaAdmin[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: rondas, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!rondas || rondas.length === 0) return { ok: true, data: [] };

  // Un solo viaje para los tickets de todas las rondas, no uno por ronda.
  const { data: tickets } = await admin
    .from("ruleta_tickets")
    .select("ronda_id, usuario_id")
    .in(
      "ronda_id",
      rondas.map((r) => r.id)
    );

  const conteo = new Map<string, number>();
  const usuarios = new Map<string, Set<string>>();
  for (const t of tickets ?? []) {
    conteo.set(t.ronda_id, (conteo.get(t.ronda_id) ?? 0) + 1);
    if (!usuarios.has(t.ronda_id)) usuarios.set(t.ronda_id, new Set());
    usuarios.get(t.ronda_id)!.add(t.usuario_id);
  }

  return {
    ok: true,
    data: (rondas as RuletaRonda[]).map((ronda) => ({
      ronda,
      totalTickets: conteo.get(ronda.id) ?? 0,
      participantes: usuarios.get(ronda.id)?.size ?? 0,
    })),
  };
}

/** Admin-only: el detalle de una ronda (participantes, tickets, ganador). */
export async function getDetalleRonda(
  rondaId: string
): Promise<ActionResult<RondaResumen>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: ronda, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    .eq("id", parsed.data)
    .single();
  if (error || !ronda) return { ok: false, error: error?.message ?? "Ronda no encontrada." };

  return { ok: true, data: await resumenDeRonda(admin, ronda as RuletaRonda) };
}

export async function guardarRonda(
  input: GuardarRondaInput
): Promise<ActionResult<RuletaRonda>> {
  const parsed = guardarRondaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_guardar_ronda", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data.rondaId ?? null,
    p_nombre: parsed.data.nombre,
    p_premio_concepto: parsed.data.premioConcepto || null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

export async function cambiarEstadoRonda(
  input: CambiarEstadoRondaInput
): Promise<ActionResult<RuletaRonda>> {
  const parsed = cambiarEstadoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cambiar_estado_ronda", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data.rondaId,
    p_estado: parsed.data.estado,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

/** Admin-only: tickets pagados por fuera. No descuenta saldo (ver 0048). */
export async function agregarTickets(
  input: AgregarTicketsInput
): Promise<ActionResult<RuletaTicket[]>> {
  const parsed = agregarTicketsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_agregar_tickets", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data.rondaId,
    p_usuario_id: parsed.data.usuarioId,
    p_cantidad: parsed.data.cantidad,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as RuletaTicket[] };
}

/**
 * EL botón. El ganador se elige, se paga y se guarda dentro del RPC; recién
 * después se fija `giro_inicia_en`, así que para cuando el primer cliente se
 * entera de que hay que animar, el resultado ya está escrito en la base.
 *
 * Un segundo clic sobre la misma ronda lo rebota Postgres, no esta función.
 */
export async function girarRuleta(rondaId: string): Promise<ActionResult<RuletaRonda>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_girar_ruleta", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

/** Cierra la ronda para el historial. No mueve plata: el premio ya se pagó
 * al girar. */
export async function finalizarRonda(rondaId: string): Promise<ActionResult<RuletaRonda>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_finalizar_ronda", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

export async function getConfig(): Promise<ActionResult<CachudobetConfig>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("cachudobet_config").select("*").single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falta la configuración de CACHUDOBET." };
  }
  return { ok: true, data: data as CachudobetConfig };
}

export async function guardarConfig(
  input: GuardarConfigInput
): Promise<ActionResult<CachudobetConfig>> {
  const parsed = guardarConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (parsed.data.caraSelloMax < parsed.data.caraSelloMin) {
    return { ok: false, error: "El máximo de cara o sello no puede ser menor que el mínimo." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_guardar_config", {
    p_admin_id: session.userId,
    p_precio_ticket: parsed.data.precioTicket,
    p_porcentaje_premio: parsed.data.porcentajePremio,
    p_cara_sello_multiplicador: parsed.data.caraSelloMultiplicador,
    p_cara_sello_min: parsed.data.caraSelloMin,
    p_cara_sello_max: parsed.data.caraSelloMax,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CachudobetConfig };
}

export interface RondaHistorial {
  ronda: RuletaRonda;
  ganadorNickname: string | null;
  totalTickets: number;
  participantes: number;
}

/** Historial público de rondas ya sorteadas. */
export async function getHistorialRondas(): Promise<ActionResult<RondaHistorial[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: rondas, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    .in("estado", ["girando", "finalizada"])
    .order("girada_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };
  if (!rondas || rondas.length === 0) return { ok: true, data: [] };

  const ids = rondas.map((r) => r.id);
  const ganadorIds = [
    ...new Set(rondas.map((r) => r.ganador_usuario_id).filter((id): id is string => !!id)),
  ];

  const [{ data: tickets }, { data: perfiles }] = await Promise.all([
    admin.from("ruleta_tickets").select("ronda_id, usuario_id").in("ronda_id", ids),
    ganadorIds.length
      ? admin.from("perfiles").select("id, nickname").in("id", ganadorIds)
      : Promise.resolve({ data: [] as { id: string; nickname: string }[] }),
  ]);

  const conteo = new Map<string, number>();
  const usuarios = new Map<string, Set<string>>();
  for (const t of tickets ?? []) {
    conteo.set(t.ronda_id, (conteo.get(t.ronda_id) ?? 0) + 1);
    if (!usuarios.has(t.ronda_id)) usuarios.set(t.ronda_id, new Set());
    usuarios.get(t.ronda_id)!.add(t.usuario_id);
  }
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: (rondas as RuletaRonda[]).map((ronda) => ({
      ronda,
      ganadorNickname: ronda.ganador_usuario_id
        ? (nicknamePorId.get(ronda.ganador_usuario_id) ?? null)
        : null,
      totalTickets: conteo.get(ronda.id) ?? 0,
      participantes: usuarios.get(ronda.id)?.size ?? 0,
    })),
  };
}
