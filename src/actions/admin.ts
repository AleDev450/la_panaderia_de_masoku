"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminMetricas, Evento, Perfil } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";
import { AdminCambiarPasswordInput, adminCambiarPasswordSchema } from "@/lib/validation/perfil";
import { HERRAMIENTAS_PRUEBA } from "@/lib/flags";

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

const resultadoSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  resultado: z.enum(["a", "b"]),
});
export type ResultadoInput = z.infer<typeof resultadoSchema>;
// La ventana de corrección vive en src/lib/eventos.ts: acá no se puede
// exportar una constante (ver el comentario en ese archivo).

export async function getMetricas(): Promise<ActionResult<AdminMetricas>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_metricas", { p_admin_id: session.userId });
  if (error) return { ok: false, error: error.message };

  const fila = (data as AdminMetricas[])?.[0];
  if (!fila) return { ok: false, error: "No pudimos calcular las métricas." };

  // `?? 0` y no solo Number(): si el RPC en la base todavía tiene una
  // firma vieja (una migración sin aplicar), los campos nuevos llegan
  // undefined y `Number(undefined)` es NaN — el panel mostraría "S/NaN"
  // en vez de un número, que es justo el tipo de síntoma que hace perder
  // una tarde buscando el bug donde no está.
  const num = (v: unknown) => Number(v ?? 0);

  return {
    ok: true,
    data: {
      depositado_hoy: num(fila.depositado_hoy),
      retirado_hoy: num(fila.retirado_hoy),
      pagado_hoy: num(fila.pagado_hoy),
      ganancia_hoy: num(fila.ganancia_hoy),
      ganancia_total: num(fila.ganancia_total),
      usuarios_total: num(fila.usuarios_total),
      usuarios_baneados: num(fila.usuarios_baneados),
      eventos_abiertos: num(fila.eventos_abiertos),
      retiros_pendientes: num(fila.retiros_pendientes),
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

const eliminarUsuarioSchema = z.object({
  usuarioId: z.string().uuid("Usuario inválido."),
});
export type EliminarUsuarioInput = z.infer<typeof eliminarUsuarioSchema>;

/**
 * Borrado duro: solo para cuentas sin rastro (sin apuestas, sin saldo). Con
 * historial, `admin_eliminar_usuario` rechaza el borrado y hay que suspender
 * en su lugar — ver 0015_eliminar_usuario.sql.
 *
 * El RPC borra `perfiles`, pero la cuenta de Auth es aparte: si no se borra
 * acá también, el correo queda "usado" en Supabase Auth y esa persona nunca
 * más podría registrarse.
 */
export async function eliminarUsuario(input: EliminarUsuarioInput): Promise<ActionResult<null>> {
  const parsed = eliminarUsuarioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("admin_eliminar_usuario", {
    p_admin_id: session.userId,
    p_usuario_id: parsed.data.usuarioId,
  });
  if (error) return { ok: false, error: error.message };

  const { error: authError } = await admin.auth.admin.deleteUser(parsed.data.usuarioId);
  if (authError) {
    // El perfil ya se borró; la cuenta de Auth queda huérfana pero
    // inofensiva (sin perfil no puede iniciar sesión). Se avisa igual.
    return {
      ok: false,
      error: "Se borró el perfil, pero no la cuenta de acceso: " + authError.message,
    };
  }

  return { ok: true, data: null };
}

/** Admin-only: resetea la contraseña de un jugador que perdió acceso. */
export async function cambiarPasswordUsuario(
  input: AdminCambiarPasswordInput
): Promise<ActionResult<null>> {
  const parsed = adminCambiarPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.usuarioId, {
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: "No pudimos cambiar la contraseña." };

  return { ok: true, data: null };
}

/**
 * Herramienta de pruebas: borra TODOS los jugadores (perfil + cuenta de
 * Auth), su historial de apuestas, recargas, retiros, solicitudes de
 * teléfono y los eventos/salas creados. Las cuentas admin no se tocan. Ver
 * 0017_resetear_plataforma.sql — sin guardas, a propósito, por eso queda
 * detrás del mismo flag que `borrarTodasLasRecargas`.
 */
export async function resetearPlataforma(): Promise<ActionResult<number>> {
  if (!HERRAMIENTAS_PRUEBA) {
    return { ok: false, error: "Las herramientas de prueba están desactivadas." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_resetear_plataforma", {
    p_admin_id: session.userId,
  });
  if (error) return { ok: false, error: error.message };

  const usuarioIds = data ?? [];
  // Mejor esfuerzo: si una cuenta de Auth falla al borrarse, las demás
  // igual se procesan — no vale la pena revertir el borrado ya hecho en
  // `perfiles` por un solo error de red.
  await Promise.all(usuarioIds.map((id) => admin.auth.admin.deleteUser(id)));

  return { ok: true, data: usuarioIds.length };
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

/**
 * Fase 1: guarda el ganador **sin pagar** y abre la ventana de corrección.
 * Ver 0013_resolucion_en_dos_fases.sql.
 */
export async function declararResultado(input: ResultadoInput): Promise<ActionResult<Evento>> {
  const parsed = resultadoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_declarar_resultado", {
    p_admin_id: session.userId,
    p_evento_id: parsed.data.eventoId,
    p_resultado: parsed.data.resultado,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}

/** Fase 2 (opcional): cambiar el ganador, una sola vez y antes de pagar. */
export async function corregirResultado(input: ResultadoInput): Promise<ActionResult<Evento>> {
  const parsed = resultadoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_corregir_resultado", {
    p_admin_id: session.userId,
    p_evento_id: parsed.data.eventoId,
    p_resultado: parsed.data.resultado,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}

/** Fase 3: paga con el resultado preliminar vigente. */
export async function confirmarPago(eventoId: string): Promise<ActionResult<Evento>> {
  if (!z.string().uuid().safeParse(eventoId).success) {
    return { ok: false, error: "Evento inválido." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_confirmar_pago", {
    p_admin_id: session.userId,
    p_evento_id: eventoId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}

/**
 * Liquida en lote todo lo que ya cumplió su minuto. Sin pg_cron nadie
 * dispara esto solo: lo llama el panel de títulos al abrirse y cuando un
 * contador llega a cero.
 */
export async function liquidarVencidos(): Promise<ActionResult<number>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("liquidar_eventos_vencidos", {});

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: Number(data ?? 0) };
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
