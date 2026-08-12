"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminMetricas, Evento, Perfil } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

async function requireAdminId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: "Debes iniciar sesión." };

  // Chequeo temprano para no llamar RPCs con un usuario sin permisos; cada
  // RPC igual re-valida `es_admin()` en Postgres, así que esto no es la
  // única defensa.
  const admin = createSupabaseAdminClient();
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (perfil?.rol !== "admin") return { ok: false, error: "No autorizado." };

  return { ok: true, userId: user.id };
}

const banearSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido."),
  banear: z.boolean(),
  motivo: z.string().trim().max(300, "El motivo es demasiado largo.").optional(),
});
export type BanearUsuarioInput = z.infer<typeof banearSchema>;

const estadoEventoSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  abrir: z.boolean(),
  /** Solo se usa al reabrir un título cuyo contador ya venció. */
  minutos: z.number().int().min(1).max(1440).optional(),
});
export type CambiarEstadoEventoInput = z.infer<typeof estadoEventoSchema>;

export async function getMetricas(): Promise<ActionResult<AdminMetricas>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_metricas", { p_admin_id: session.userId });
  if (error) return { ok: false, error: error.message };

  const fila = (data as AdminMetricas[])?.[0];
  if (!fila) return { ok: false, error: "No pudimos calcular las métricas." };

  return {
    ok: true,
    data: {
      depositado_hoy: Number(fila.depositado_hoy),
      retirado_hoy: Number(fila.retirado_hoy),
      pagado_hoy: Number(fila.pagado_hoy),
      ganancia_hoy: Number(fila.ganancia_hoy),
      ganancia_total: Number(fila.ganancia_total),
      usuarios_total: Number(fila.usuarios_total),
      usuarios_baneados: Number(fila.usuarios_baneados),
      eventos_abiertos: Number(fila.eventos_abiertos),
      retiros_pendientes: Number(fila.retiros_pendientes),
    },
  };
}

export interface UsuarioAdmin {
  id: string;
  nickname: string;
  fullName: string | null;
  phone: string | null;
  puntos: number;
  saldoDisponible: number;
  saldoRetenido: number;
  baneado: boolean;
  baneadoMotivo: string | null;
  createdAt: string;
}

export async function getUsuarios(): Promise<ActionResult<UsuarioAdmin[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("perfiles")
    .select("*")
    .eq("rol", "user")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: ((data ?? []) as Perfil[]).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      fullName: p.full_name,
      phone: p.phone,
      puntos: Number(p.puntos),
      saldoDisponible: Number(p.saldo_disponible),
      saldoRetenido: Number(p.saldo_retenido),
      baneado: p.baneado,
      baneadoMotivo: p.baneado_motivo,
      createdAt: p.created_at,
    })),
  };
}

export async function banearUsuario(
  input: BanearUsuarioInput
): Promise<ActionResult<Perfil>> {
  const parsed = banearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_banear_usuario", {
    p_admin_id: session.userId,
    p_usuario_id: parsed.data.usuarioId,
    p_banear: parsed.data.banear,
    p_motivo: parsed.data.motivo ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Perfil };
}

/** Abrir/cerrar las apuestas de un título a mano, sin esperar al contador. */
export async function cambiarEstadoEvento(
  input: CambiarEstadoEventoInput
): Promise<ActionResult<Evento>> {
  const parsed = estadoEventoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cambiar_estado_evento", {
    p_admin_id: session.userId,
    p_evento_id: parsed.data.eventoId,
    p_abrir: parsed.data.abrir,
    p_minutos: parsed.data.minutos ?? 10,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}
