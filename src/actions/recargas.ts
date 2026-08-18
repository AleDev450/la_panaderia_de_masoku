"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CorregirMontoRecargaInput,
  CrearRecargaInput,
  ResolverRecargaInput,
  corregirMontoRecargaSchema,
  crearRecargaSchema,
  resolverRecargaSchema,
} from "@/lib/validation/recargas";
import { Recarga } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";
import { HERRAMIENTAS_PRUEBA } from "@/lib/flags";
import { dentroDeLimite } from "@/lib/rateLimit";

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

  // Un usuario suspendido no puede seguir mandando recargas. La RLS ya lo
  // corta a nivel de base (ver 0032), pero se revisa acá también para dar un
  // mensaje claro y ni siquiera intentar el insert.
  const adminClient = createSupabaseAdminClient();
  const { data: perfil } = await adminClient
    .from("perfiles")
    .select("baneado")
    .eq("id", session.userId)
    .single();
  if (perfil?.baneado) {
    return { ok: false, error: "Tu cuenta está suspendida." };
  }

  // Anti-abuso: tope de recargas por usuario. El tamaño del comprobante y el
  // rango del monto ya los frena la base (CHECK en 0031) por cualquier
  // camino; esto además corta el envío repetido desde la Server Action.
  if (!(await dentroDeLimite(`recarga:${session.userId}`, 15, 3600))) {
    return {
      ok: false,
      error: "Enviaste demasiadas recargas seguidas. Espera un momento e intenta de nuevo.",
    };
  }

  // IP del cliente para rastrear/bloquear abusos (0033). En Vercel la IP
  // real llega en x-forwarded-for.
  const cabeceras = await headers();
  const ip =
    cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cabeceras.get("x-real-ip") ||
    null;

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

  // La IP se guarda aparte, a mejor esfuerzo: si este código se desplegó
  // antes de correr la migración 0033, la columna `ip` todavía no existe y
  // esto falla en silencio, sin romper la recarga. Se usa el cliente admin
  // porque `recargas` no tiene policy de UPDATE para el jugador.
  if (ip) {
    await adminClient.from("recargas").update({ ip }).eq("id", data.id);
  }

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

/**
 * Corrige el monto acreditado de una recarga YA aprobada — para cuando se
 * aprobó de más (ej. saldo de prueba marcado como depósito real). Ajusta
 * el saldo del jugador por la diferencia en la misma transacción; ver
 * 0025_corregir_monto_recarga.sql.
 */
export async function corregirMontoRecarga(
  input: CorregirMontoRecargaInput
): Promise<ActionResult<Recarga>> {
  const parsed = corregirMontoRecargaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_corregir_monto_recarga", {
    p_admin_id: session.userId,
    p_recarga_id: parsed.data.recargaId,
    p_monto_nuevo: parsed.data.montoNuevo,
    p_motivo: parsed.data.motivo,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Recarga };
}
