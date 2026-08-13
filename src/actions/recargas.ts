"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CrearRecargaInput,
  ResolverRecargaInput,
  crearRecargaSchema,
  resolverRecargaSchema,
} from "@/lib/validation/recargas";
import { Recarga } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";
import { HERRAMIENTAS_PRUEBA } from "@/lib/flags";

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

export async function crearRecarga(input: CrearRecargaInput): Promise<ActionResult<Recarga>> {
  const parsed = crearRecargaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recargas")
    .insert({
      usuario_id: session.userId,
      monto_solicitado: parsed.data.monto,
      comprobante: parsed.data.comprobante,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: "No pudimos enviar tu recarga." };
  return { ok: true, data: data as Recarga };
}

/** Sin el comprobante: el jugador ya sabe qué subió y traerlo infla la respuesta. */
export type RecargaResumen = Omit<Recarga, "comprobante">;

export async function getMisRecargas(): Promise<ActionResult<RecargaResumen[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recargas")
    .select("id, usuario_id, monto_solicitado, monto_acreditado, estado, revisado_por, revisado_at, created_at")
    .eq("usuario_id", session.userId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as RecargaResumen[] };
}

export interface RecargaConUsuario {
  recarga: Recarga;
  usuario: { nickname: string; fullName: string | null; phone: string | null };
}

/**
 * Admin-only: la cola de /bakery/recargas. Trae también nickname, nombre y
 * teléfono del jugador — el teléfono es justamente el dato con el que se
 * verifica de quién vino el depósito del comprobante.
 */
export async function getRecargas(): Promise<ActionResult<RecargaConUsuario[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: perfilAdmin } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", session.userId)
    .single();
  if (perfilAdmin?.rol !== "admin") return { ok: false, error: "No autorizado." };

  const { data: recargas, error } = await admin
    .from("recargas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!recargas || recargas.length === 0) return { ok: true, data: [] };

  const usuarioIds = [...new Set(recargas.map((r) => r.usuario_id))];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nickname, full_name, phone")
    .in("id", usuarioIds);
  const perfilPorId = new Map((perfiles ?? []).map((p) => [p.id, p]));

  return {
    ok: true,
    data: recargas.map((recarga) => {
      const perfil = perfilPorId.get(recarga.usuario_id);
      return {
        recarga: recarga as Recarga,
        usuario: {
          nickname: perfil?.nickname ?? "—",
          fullName: perfil?.full_name ?? null,
          phone: perfil?.phone ?? null,
        },
      };
    }),
  };
}

/**
 * Admin-only, herramienta de pruebas: vacía la tabla de recargas.
 *
 * No revierte el saldo ya acreditado (ver 0014). El flag se revalida acá y
 * no solo en la UI: una Server Action es un endpoint POST invocable
 * directamente, así que esconder el botón no protegería nada.
 */
export async function borrarTodasLasRecargas(): Promise<ActionResult<number>> {
  if (!HERRAMIENTAS_PRUEBA) {
    return { ok: false, error: "Las herramientas de prueba están desactivadas." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_borrar_recargas", {
    p_admin_id: session.userId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: Number(data ?? 0) };
}

/** Admin-only: el RPC re-valida `es_admin()` y acredita el saldo en la misma transacción. */
export async function resolverRecarga(
  input: ResolverRecargaInput
): Promise<ActionResult<Recarga>> {
  const parsed = resolverRecargaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_resolver_recarga", {
    p_admin_id: session.userId,
    p_recarga_id: parsed.data.recargaId,
    p_aprobar: parsed.data.aprobar,
    p_monto_acreditado: parsed.data.montoAcreditado ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Recarga };
}
