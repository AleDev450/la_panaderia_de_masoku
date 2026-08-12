"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Retiro } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";
import { RETIRO_MIN } from "@/lib/retiros";

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

const solicitarRetiroSchema = z.object({
  monto: z
    .number()
    .min(RETIRO_MIN, `El retiro mínimo es S/${RETIRO_MIN}.`)
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
});
export type SolicitarRetiroInput = z.infer<typeof solicitarRetiroSchema>;

const resolverRetiroSchema = z.object({
  retiroId: z.string().uuid("Retiro inválido."),
  pagar: z.boolean(),
  motivo: z.string().trim().max(300, "El motivo es demasiado largo.").optional(),
});
export type ResolverRetiroInput = z.infer<typeof resolverRetiroSchema>;

/**
 * El RPC retiene el saldo en la misma transacción que crea la solicitud
 * — ver 0012_retiros.sql por qué eso no puede quedar en el cliente.
 */
export async function solicitarRetiro(
  input: SolicitarRetiroInput
): Promise<ActionResult<Retiro>> {
  const parsed = solicitarRetiroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("solicitar_retiro", {
    p_usuario_id: session.userId,
    p_monto: parsed.data.monto,
  });

  if (error) {
    // El índice único parcial impide una segunda solicitud pendiente.
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Ya tienes un retiro pendiente de pago."
          : error.message,
    };
  }
  return { ok: true, data: data as Retiro };
}

export async function getMisRetiros(): Promise<ActionResult<Retiro[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("retiros")
    .select("*")
    .eq("usuario_id", session.userId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Retiro[] };
}

export interface RetiroConUsuario {
  retiro: Retiro;
  usuario: { nickname: string; fullName: string | null };
}

/** Admin-only: la cola de retiros por pagar. */
export async function getRetiros(): Promise<ActionResult<RetiroConUsuario[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: perfilAdmin } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", session.userId)
    .single();
  if (perfilAdmin?.rol !== "admin") return { ok: false, error: "No autorizado." };

  const { data: retiros, error } = await admin
    .from("retiros")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!retiros || retiros.length === 0) return { ok: true, data: [] };

  const usuarioIds = [...new Set(retiros.map((r) => r.usuario_id))];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nickname, full_name")
    .in("id", usuarioIds);
  const perfilPorId = new Map((perfiles ?? []).map((p) => [p.id, p]));

  return {
    ok: true,
    data: retiros.map((retiro) => {
      const perfil = perfilPorId.get(retiro.usuario_id);
      return {
        retiro: retiro as Retiro,
        usuario: {
          nickname: perfil?.nickname ?? "—",
          fullName: perfil?.full_name ?? null,
        },
      };
    }),
  };
}

/** Admin-only: marcar pagado (el dinero sale) o rechazar (vuelve al saldo). */
export async function resolverRetiro(
  input: ResolverRetiroInput
): Promise<ActionResult<Retiro>> {
  const parsed = resolverRetiroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_resolver_retiro", {
    p_admin_id: session.userId,
    p_retiro_id: parsed.data.retiroId,
    p_pagar: parsed.data.pagar,
    p_motivo: parsed.data.motivo ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Retiro };
}
