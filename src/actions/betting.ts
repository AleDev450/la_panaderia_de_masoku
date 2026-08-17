"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CancelarApuestaInput,
  CrearApuestaInput,
  CrearEventoInput,
  ResolverEventoInput,
  cancelarApuestaSchema,
  crearApuestaSchema,
  crearEventoSchema,
  resolverEventoSchema,
} from "@/lib/validation/betting";
import { Apuesta, Evento } from "@/lib/supabase/types";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * All three actions below resolve the acting user's id from their session
 * cookie (never trust a client-supplied user id), then delegate the actual
 * work to the Postgres RPCs via the service_role client. No matching or
 * balance math happens in this file — see supabase/migrations/0002_functions.sql.
 */
async function requireSessionUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, error: "Debes iniciar sesión." };
  }
  return { ok: true, userId: user.id };
}

export async function crearApuesta(
  input: CrearApuestaInput
): Promise<ActionResult<Apuesta>> {
  const parsed = crearApuestaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("crear_apuesta", {
    p_usuario_id: session.userId,
    p_evento_id: parsed.data.eventoId,
    p_lado: parsed.data.lado,
    p_monto: parsed.data.monto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Apuesta };
}

export async function cancelarApuesta(
  input: CancelarApuestaInput
): Promise<ActionResult<Apuesta>> {
  const parsed = cancelarApuestaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("cancelar_apuesta", {
    p_apuesta_id: parsed.data.apuestaId,
    p_usuario_id: session.userId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Apuesta };
}

/** Admin-only: the RPC itself re-checks `es_admin()` server-side via RLS-bypassing SECURITY DEFINER. */
export async function resolverEvento(
  input: ResolverEventoInput
): Promise<ActionResult<null>> {
  const parsed = resolverEventoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  // resolver_evento takes p_admin_id explicitly (not auth.uid()) because
  // this call goes through the service_role client, which carries no user
  // JWT. The function re-validates es_admin(p_admin_id) itself in Postgres
  // — this server-side check is not the only line of defense.
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("resolver_evento", {
    p_evento_id: parsed.data.eventoId,
    p_resultado: parsed.data.resultado,
    p_admin_id: session.userId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export interface ApuestaConEvento {
  apuesta: Apuesta;
  evento: Evento;
}

/**
 * Todas las apuestas del usuario (de cualquier evento) con el evento
 * adjunto — lo que consumen /mis-apuestas e /historial. Usa el cliente de
 * sesión: `apuestas_select_own` ya limita a las filas propias.
 */
export async function getMisApuestasConEvento(): Promise<ActionResult<ApuestaConEvento[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const supabase = await createSupabaseServerClient();
  const { data: apuestas, error } = await supabase
    .from("apuestas")
    .select("*")
    .eq("usuario_id", session.userId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!apuestas || apuestas.length === 0) return { ok: true, data: [] };

  const eventoIds = [...new Set(apuestas.map((a) => a.evento_id))];
  const { data: eventos, error: eventosError } = await supabase
    .from("eventos")
    .select("*")
    .in("id", eventoIds);
  if (eventosError) return { ok: false, error: eventosError.message };

  const eventosPorId = new Map((eventos ?? []).map((e) => [e.id, e as Evento]));

  const data = apuestas.flatMap((apuesta) => {
    const evento = eventosPorId.get(apuesta.evento_id);
    return evento ? [{ apuesta: apuesta as Apuesta, evento }] : [];
  });

  return { ok: true, data };
}

/**
 * Crea el evento con el cliente ligado a la sesión (no el de service_role):
 * la policy `eventos_admin_write` ya restringe el insert a `es_admin(auth.uid())`,
 * así que basta con que el admin esté autenticado — no hace falta escalar
 * privilegios para esto, a diferencia de las RPC de dinero.
 */
export async function crearEvento(input: CrearEventoInput): Promise<ActionResult<Evento>> {
  const parsed = crearEventoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const cierraEn = new Date(Date.now() + parsed.data.duracionMin * 60_000).toISOString();
  const { data, error } = await supabase
    .from("eventos")
    .insert({
      nombre: parsed.data.nombre,
      lado_a: parsed.data.ladoA,
      lado_b: parsed.data.ladoB,
      categoria: parsed.data.categoria,
      cierra_en: cierraEn,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}

export interface ParticipanteLado {
  usuarioId: string;
  nickname: string;
  puntos: number;
  /** Todo lo que puso esa persona en este lado (puede haber apostado varias veces). */
  monto: number;
  montoMatcheado: number;
}

export interface LadoResumen {
  label: string;
  /** Todos los que apostaron a este lado, ya estén emparejados o no. */
  participantes: ParticipanteLado[];
  totalApostado: number;
  /** Lo que este lado todavía no tiene cubierto. Es exactamente lo que
   * emparejaría de inmediato alguien que apueste al lado CONTRARIO. */
  totalPendiente: number;
}

export interface EventoResumen {
  evento: Evento;
  ladoA: LadoResumen;
  ladoB: LadoResumen;
  /** Lado en el que ya apostó quien consulta; null si todavía no entró.
   * En una sala se elige un bando y no se puede apostar al contrario. */
  miLado: "a" | "b" | null;
}

/**
 * Listado de salas para /partidas. Expone el nickname y la insignia de
 * cada apostador por lado — es un requisito de producto de esta pantalla:
 * el jugador tiene que ver contra quién está jugando.
 *
 * Solo devuelve los títulos de hoy. Para revisar días pasados está
 * `getEventosPorFecha`, que es solo para staff.
 */
export async function getEventosHoy(): Promise<ActionResult<EventoResumen[]>> {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  return listarEventos(inicioHoy.toISOString(), null);
}

/**
 * Igual que el anterior pero con rango de fechas libre, para que el staff
 * revise partidas pasadas. Restringido a admin: un jugador solo necesita
 * (y solo debe ver) lo de hoy.
 */
export async function getEventosPorFecha(
  desde: string,
  hasta: string
): Promise<ActionResult<EventoResumen[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", session.userId)
    .single();
  if (perfil?.rol !== "admin") return { ok: false, error: "No autorizado." };

  // `hasta` llega como fecha suelta (YYYY-MM-DD); se corre al final de ese
  // día para que el rango incluya lo creado durante la última jornada.
  const finHasta = new Date(`${hasta}T00:00:00`);
  finHasta.setHours(23, 59, 59, 999);

  return listarEventos(new Date(`${desde}T00:00:00`).toISOString(), finHasta.toISOString());
}

async function listarEventos(
  desdeIso: string,
  hastaIso: string | null
): Promise<ActionResult<EventoResumen[]>> {
  // Una Server Action es un endpoint POST invocable por cualquiera, no una
  // función privada de la página. Como esta usa el cliente service_role
  // (salta RLS) y devuelve nicknames y montos ajenos, exige sesión.
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();

  let query = admin.from("eventos").select("*").gte("created_at", desdeIso);
  if (hastaIso) query = query.lte("created_at", hastaIso);

  const { data: eventos, error: eventosError } = await query.order("created_at", {
    ascending: false,
  });
  if (eventosError) return { ok: false, error: eventosError.message };
  if (!eventos || eventos.length === 0) return { ok: true, data: [] };

  const eventoIds = eventos.map((e) => e.id);
  // Todas las apuestas vivas, no solo las que aún tienen monto sin cubrir.
  // Antes se filtraba por `monto_pendiente > 0` y eso escondía a quien ya
  // estaba 100% emparejado — justo el rival contra el que estás jugando.
  const { data: apuestas, error: apuestasError } = await admin
    .from("apuestas")
    .select("evento_id, lado, usuario_id, monto_total, monto_matcheado, monto_pendiente")
    .in("evento_id", eventoIds)
    .neq("estado", "cancelada")
    .order("created_at", { ascending: true });
  if (apuestasError) return { ok: false, error: apuestasError.message };

  const usuarioIds = [...new Set((apuestas ?? []).map((a) => a.usuario_id))];
  const perfilesPorId = new Map<string, { nickname: string; puntos: number }>();
  if (usuarioIds.length > 0) {
    const { data: perfiles, error: perfilesError } = await admin
      .from("perfiles")
      .select("id, nickname, puntos")
      .in("id", usuarioIds);
    if (perfilesError) return { ok: false, error: perfilesError.message };
    for (const p of perfiles ?? []) {
      perfilesPorId.set(p.id, { nickname: p.nickname, puntos: p.puntos });
    }
  }

  // Se agrupa por persona, no por apuesta: si alguien apostó dos veces al
  // mismo lado sigue siendo un solo rival, con la suma de sus montos.
  // Así "1 vs 3" cuenta personas, que es como lo lee un jugador.
  const participantesPorEventoLado = new Map<string, Map<string, ParticipanteLado>>();
  for (const a of apuestas ?? []) {
    const key = `${a.evento_id}:${a.lado}`;
    let porUsuario = participantesPorEventoLado.get(key);
    if (!porUsuario) {
      porUsuario = new Map();
      participantesPorEventoLado.set(key, porUsuario);
    }
    const perfil = perfilesPorId.get(a.usuario_id);
    const previo = porUsuario.get(a.usuario_id);
    porUsuario.set(a.usuario_id, {
      usuarioId: a.usuario_id,
      nickname: perfil?.nickname ?? "—",
      puntos: perfil?.puntos ?? 0,
      monto: (previo?.monto ?? 0) + Number(a.monto_total),
      montoMatcheado: (previo?.montoMatcheado ?? 0) + Number(a.monto_matcheado),
    });
  }

  const pendientePorEventoLado = new Map<string, number>();
  for (const a of apuestas ?? []) {
    const key = `${a.evento_id}:${a.lado}`;
    pendientePorEventoLado.set(
      key,
      (pendientePorEventoLado.get(key) ?? 0) + Number(a.monto_pendiente)
    );
  }

  function resumenDeLado(eventoId: string, lado: "a" | "b", label: string): LadoResumen {
    const key = `${eventoId}:${lado}`;
    const participantes = [...(participantesPorEventoLado.get(key)?.values() ?? [])];
    return {
      label,
      participantes,
      totalApostado: participantes.reduce((sum, p) => sum + p.monto, 0),
      totalPendiente: pendientePorEventoLado.get(key) ?? 0,
    };
  }

  // En qué lado ya entró quien consulta (cualquier apuesta viva, incluso
  // las ya cubiertas del todo, que no salen en la consulta de arriba).
  const { data: misApuestas } = await admin
    .from("apuestas")
    .select("evento_id, lado")
    .in("evento_id", eventoIds)
    .eq("usuario_id", session.userId)
    .neq("estado", "cancelada");
  const miLadoPorEvento = new Map<string, "a" | "b">();
  for (const a of misApuestas ?? []) miLadoPorEvento.set(a.evento_id, a.lado);

  const resumenes: EventoResumen[] = eventos.map((evento) => ({
    evento: evento as Evento,
    miLado: miLadoPorEvento.get(evento.id) ?? null,
    ladoA: resumenDeLado(evento.id, "a", evento.lado_a),
    ladoB: resumenDeLado(evento.id, "b", evento.lado_b),
  }));

  return { ok: true, data: resumenes };
}
