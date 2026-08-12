"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CreditarSaldoInput,
  OtorgarPuntosInput,
  creditarSaldoSchema,
  otorgarPuntosSchema,
} from "@/lib/validation/perfiles";
import { Perfil } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

/** Igual patrón que requireSessionUserId en betting.ts: nunca confiar en un
 * admin id mandado por el cliente, siempre resolverlo desde la cookie de sesión. */
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

/** Admin-only: acredita saldo a un jugador (aprobación de recarga en /bakery/recargas). */
export async function adminCreditarSaldo(
  input: CreditarSaldoInput
): Promise<ActionResult<Perfil>> {
  const parsed = creditarSaldoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_creditar_saldo", {
    p_admin_id: session.userId,
    p_usuario_id: parsed.data.usuarioId,
    p_monto: parsed.data.monto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Perfil };
}

/** Admin-only: otorga puntos a un jugador (resolución de título en /bakery/titulos). */
export async function adminOtorgarPuntos(
  input: OtorgarPuntosInput
): Promise<ActionResult<Perfil>> {
  const parsed = otorgarPuntosSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_otorgar_puntos", {
    p_admin_id: session.userId,
    p_usuario_id: parsed.data.usuarioId,
    p_puntos: parsed.data.puntos,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Perfil };
}
