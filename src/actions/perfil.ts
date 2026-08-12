"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ActualizarEmailInput,
  ActualizarNicknameInput,
  ResolverSolicitudTelefonoInput,
  SolicitarCambioTelefonoInput,
  actualizarEmailSchema,
  actualizarNicknameSchema,
  resolverSolicitudTelefonoSchema,
  solicitarCambioTelefonoSchema,
} from "@/lib/validation/perfil";
import { Perfil, SolicitudTelefono } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

async function requireSession(): Promise<
  { ok: true; userId: string; email: string | undefined } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { ok: false, error: "Debes iniciar sesión." };
  return { ok: true, userId: user.id, email: user.email };
}

/**
 * El nickname es único (unique index en `perfiles`); el RPC
 * `actualizar_nickname` hace además la comparación case-insensitive y
 * traduce el choque a un mensaje entendible.
 */
export async function actualizarNickname(
  input: ActualizarNicknameInput
): Promise<ActionResult<Perfil>> {
  const parsed = actualizarNicknameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSession();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("actualizar_nickname", {
    p_usuario_id: session.userId,
    p_nickname: parsed.data.nickname,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("ya está en uso")
        ? "Ese nickname ya está en uso."
        : "No pudimos actualizar tu nickname.",
    };
  }
  return { ok: true, data: data as Perfil };
}

/**
 * Cambia el correo en Supabase Auth (no en `perfiles` — ahí no se guarda).
 * Se usa el cliente admin con `email_confirm` implícito: igual que el
 * registro, el cambio queda efectivo de inmediato sin pedirle al usuario
 * que confirme por correo.
 */
export async function actualizarEmail(
  input: ActualizarEmailInput
): Promise<ActionResult<{ email: string }>> {
  const parsed = actualizarEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSession();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.updateUserById(session.userId, {
    email: parsed.data.email,
    email_confirm: true,
  });

  if (error || !data.user) {
    const duplicado =
      error?.code === "email_exists" ||
      /already.*(regist|exist)|(regist|exist).*already/i.test(error?.message ?? "");
    return {
      ok: false,
      error: duplicado ? "Ya existe una cuenta con ese correo." : "No pudimos cambiar tu correo.",
    };
  }

  return { ok: true, data: { email: data.user.email ?? parsed.data.email } };
}

/**
 * El teléfono no se cambia solo: se crea una solicitud que un admin
 * aprueba desde /bakery/telefonos (ver 0008_solicitudes_telefono.sql por
 * qué este dato se trata distinto al nickname/correo).
 */
export async function solicitarCambioTelefono(
  input: SolicitarCambioTelefonoInput
): Promise<ActionResult<SolicitudTelefono>> {
  const parsed = solicitarCambioTelefonoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSession();
  if (!session.ok) return session;

  const supabase = await createSupabaseServerClient();
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("phone")
    .eq("id", session.userId)
    .single();

  const { data, error } = await supabase
    .from("solicitudes_telefono")
    .insert({
      usuario_id: session.userId,
      telefono_actual: perfil?.phone ?? null,
      telefono_nuevo: parsed.data.telefonoNuevo,
      motivo: parsed.data.motivo ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // El unique index parcial `idx_solicitudes_telefono_una_pendiente`
    // impide una segunda solicitud mientras haya una sin revisar.
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Ya tienes una solicitud pendiente de revisión."
          : "No pudimos registrar tu solicitud.",
    };
  }
  return { ok: true, data: data as SolicitudTelefono };
}

export async function getMisSolicitudesTelefono(): Promise<ActionResult<SolicitudTelefono[]>> {
  const session = await requireSession();
  if (!session.ok) return session;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("solicitudes_telefono")
    .select("*")
    .eq("usuario_id", session.userId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as SolicitudTelefono[] };
}

export interface SolicitudConPerfil {
  solicitud: SolicitudTelefono;
  nickname: string;
}

/** Admin-only: la cola de /bakery/telefonos. */
export async function getSolicitudesTelefono(): Promise<ActionResult<SolicitudConPerfil[]>> {
  const session = await requireSession();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: perfilAdmin } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", session.userId)
    .single();
  if (perfilAdmin?.rol !== "admin") {
    return { ok: false, error: "No autorizado." };
  }

  const { data: solicitudes, error } = await admin
    .from("solicitudes_telefono")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!solicitudes || solicitudes.length === 0) return { ok: true, data: [] };

  const usuarioIds = [...new Set(solicitudes.map((s) => s.usuario_id))];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nickname")
    .in("id", usuarioIds);
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: solicitudes.map((solicitud) => ({
      solicitud: solicitud as SolicitudTelefono,
      nickname: nicknamePorId.get(solicitud.usuario_id) ?? "—",
    })),
  };
}

/** Admin-only: el RPC re-valida `es_admin()` en Postgres. */
export async function resolverSolicitudTelefono(
  input: ResolverSolicitudTelefonoInput
): Promise<ActionResult<SolicitudTelefono>> {
  const parsed = resolverSolicitudTelefonoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSession();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_resolver_solicitud_telefono", {
    p_admin_id: session.userId,
    p_solicitud_id: parsed.data.solicitudId,
    p_aprobar: parsed.data.aprobar,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as SolicitudTelefono };
}
