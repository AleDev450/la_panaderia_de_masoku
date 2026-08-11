"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CancelarApuestaInput,
  CrearApuestaInput,
  ResolverEventoInput,
  cancelarApuestaSchema,
  crearApuestaSchema,
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

export async function getEvento(eventoId: string): Promise<ActionResult<Evento>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("eventos")
    .select("*")
    .eq("id", eventoId)
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}

export interface OrderBookSide {
  monto_pendiente_total: number;
  ordenes: number;
}

export interface OrderBook {
  lado_a: OrderBookSide;
  lado_b: OrderBookSide;
}

/**
 * Aggregated pending amount per side — what the UI calls "el order book".
 * Uses the service_role client on purpose: `apuestas_select_own` (RLS)
 * only lets a user read their own rows, but the order book is public
 * liquidity data aggregated across every user. This function returns only
 * sums/counts, never individual rows, user ids, or amounts per bettor.
 */
export async function getOrderBook(eventoId: string): Promise<ActionResult<OrderBook>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("apuestas")
    .select("lado, monto_pendiente")
    .eq("evento_id", eventoId)
    .gt("monto_pendiente", 0);

  if (error) return { ok: false, error: error.message };

  const book: OrderBook = {
    lado_a: { monto_pendiente_total: 0, ordenes: 0 },
    lado_b: { monto_pendiente_total: 0, ordenes: 0 },
  };

  for (const row of data ?? []) {
    const side = row.lado === "a" ? book.lado_a : book.lado_b;
    side.monto_pendiente_total += Number(row.monto_pendiente);
    side.ordenes += 1;
  }

  return { ok: true, data: book };
}

export async function getMisApuestas(eventoId: string): Promise<ActionResult<Apuesta[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("apuestas")
    .select("*")
    .eq("evento_id", eventoId)
    .eq("usuario_id", session.userId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Apuesta[] };
}
