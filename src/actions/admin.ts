"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  AdminMetricas,
  AjusteSaldo,
  AjusteYape,
  Evento,
  IngresoManual,
  PagoManual,
  Perfil,
  ResumenDia,
} from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";
import { AdminCambiarPasswordInput, adminCambiarPasswordSchema } from "@/lib/validation/perfil";
import {
  AjustarSaldoInput,
  DarSaldoFakeInput,
  RegistrarAjusteYapeInput,
  RegistrarIngresoInput,
  RegistrarPagoManualInput,
  ajustarSaldoSchema,
  darSaldoFakeSchema,
  registrarAjusteYapeSchema,
  registrarIngresoSchema,
  registrarPagoManualSchema,
} from "@/lib/validation/pagos";
import {
  CancelarEventoInput,
  EliminarEventoPruebaInput,
  cancelarEventoSchema,
  eliminarEventoPruebaSchema,
} from "@/lib/validation/betting";
import { HERRAMIENTAS_PRUEBA } from "@/lib/flags";
import { inicioDeDiaEnPeru } from "@/lib/eventos";

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
      saldos_usuarios_total: num(fila.saldos_usuarios_total),
      pagos_manuales_total: num(fila.pagos_manuales_total),
      ajustes_yape_total: num(fila.ajustes_yape_total),
      yape_esperado: num(fila.yape_esperado),
      retiros_pagados_hoy: num(fila.retiros_pagados_hoy),
      saldo_fake_total: num(fila.saldo_fake_total),
      ajustes_saldo_total: num(fila.ajustes_saldo_total),
      recargas_total: num(fila.recargas_total),
      retiros_total: num(fila.retiros_total),
      ingresos_manuales_total: num(fila.ingresos_manuales_total),
      // Desglose por juego (0052). Si 0052 no corrió todavía, llegan
      // undefined y quedan en 0: el panel muestra el total viejo y el
      // desglose en cero, en vez de "S/NaN".
      ganancia_partidas_hoy: num(fila.ganancia_partidas_hoy),
      ganancia_partidas_total: num(fila.ganancia_partidas_total),
      ganancia_ruleta_hoy: num(fila.ganancia_ruleta_hoy),
      ganancia_ruleta_total: num(fila.ganancia_ruleta_total),
      ganancia_cara_sello_hoy: num(fila.ganancia_cara_sello_hoy),
      ganancia_cara_sello_total: num(fila.ganancia_cara_sello_total),
      pagos_personal_hoy: num(fila.pagos_personal_hoy),
      pagos_personal_total: num(fila.pagos_personal_total),
    },
  };
}

/**
 * Resumen día a día (calendario de Perú) entre dos fechas — lo que el panel
 * muestra en un cuadro y exporta a Excel. `desde`/`hasta` son fechas sueltas
 * YYYY-MM-DD; el RPC agrupa por día de Perú. Ver 0034_resumen_diario.sql.
 */
export async function getResumenDiario(
  desde: string,
  hasta: string
): Promise<ActionResult<ResumenDia[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_resumen_diario", {
    p_admin_id: session.userId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data as ResumenDia[] | null ?? []).map((d) => ({
      fecha: d.fecha,
      depositado: Number(d.depositado ?? 0),
      apostado: Number(d.apostado ?? 0),
      pagado: Number(d.pagado ?? 0),
      retirado: Number(d.retirado ?? 0),
      comision: Number(d.comision ?? 0),
      ganancia_real: Number(d.ganancia_real ?? 0),
      yape_acumulado: Number(d.yape_acumulado ?? 0),
      // Desglose por juego (0052) — 0 si la migración todavía no corrió.
      comision_partidas: Number(d.comision_partidas ?? 0),
      comision_ruleta: Number(d.comision_ruleta ?? 0),
      comision_cara_sello: Number(d.comision_cara_sello ?? 0),
    })),
  };
}

/**
 * Retiro propio del admin o pago a un trabajador — dinero que sale del
 * Yape de la plataforma por fuera del juego. No toca saldo de ningún
 * usuario: es solo el registro contable que explica por qué el Yape real
 * tiene menos de lo que `admin_metricas.yape_esperado` calcularía sin él.
 */
export async function registrarPagoManual(
  input: RegistrarPagoManualInput
): Promise<ActionResult<PagoManual>> {
  const parsed = registrarPagoManualSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_registrar_pago_manual", {
    p_admin_id: session.userId,
    p_concepto: parsed.data.concepto,
    p_monto: parsed.data.monto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as PagoManual };
}

/**
 * Registra plata que entró sin pasar por el flujo de recargas — efectivo,
 * transferencia, lo que sea. Cuenta como ingreso del día y sube el total
 * que deberías tener, igual que una recarga aprobada.
 *
 * Si viene con `usuarioId`, le acredita el saldo en la MISMA transacción.
 * No hay que hacer además un "Ajustar saldo": eso contaría el dinero dos
 * veces (ver 0044).
 */
export async function registrarIngreso(
  input: RegistrarIngresoInput
): Promise<ActionResult<IngresoManual>> {
  const parsed = registrarIngresoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_registrar_ingreso", {
    p_admin_id: session.userId,
    p_concepto: parsed.data.concepto,
    p_monto: parsed.data.monto,
    p_usuario_id: parsed.data.usuarioId ? parsed.data.usuarioId : null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as IngresoManual };
}

export interface IngresoConNombres {
  ingreso: IngresoManual;
  adminNickname: string;
  usuarioNickname: string | null;
}

/** Historial de ingresos manuales, más reciente primero. */
export async function getIngresosManuales(): Promise<ActionResult<IngresoConNombres[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: ingresos, error } = await admin
    .from("ingresos_manuales")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!ingresos || ingresos.length === 0) return { ok: true, data: [] };

  const ids = [
    ...new Set(
      ingresos.flatMap((i) => [i.admin_id, i.usuario_id].filter((v): v is string => !!v))
    ),
  ];
  const { data: perfiles } = await admin.from("perfiles").select("id, nickname").in("id", ids);
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: ingresos.map((i) => ({
      ingreso: i as IngresoManual,
      adminNickname: nicknamePorId.get(i.admin_id) ?? "—",
      usuarioNickname: i.usuario_id ? (nicknamePorId.get(i.usuario_id) ?? "—") : null,
    })),
  };
}

const corregirPagadoSchema = z.object({
  eventoId: z.string().uuid("Evento inválido."),
  resultado: z.enum(["a", "b"]),
  motivo: z
    .string()
    .trim()
    .min(3, "Indica por qué se corrige.")
    .max(300, "Máximo 300 caracteres."),
  /** Corrige aunque no se pueda recuperar todo el premio ya cobrado. */
  forzar: z.boolean().optional(),
});
export type CorregirPagadoInput = z.infer<typeof corregirPagadoSchema>;

/**
 * Cambia el ganador de una partida YA PAGADA y mueve la plata.
 *
 * `corregirResultado` solo sirve dentro de la ventana de un minuto antes de
 * confirmar; esto es para cuando ya se repartió. Aplica solo la DIFERENCIA
 * entre lo que cada uno cobró y lo que le tocaba, y recalcula la comisión
 * (que con saldo fake de por medio sí cambia según quién gane). Ver
 * 0046_corregir_resultado_pagado.sql.
 *
 * Si el que cobró de más ya no tiene la plata, se rechaza diciendo quién y
 * cuánto falta — salvo que se mande `forzar`.
 */
export async function corregirResultadoPagado(
  input: CorregirPagadoInput
): Promise<ActionResult<Evento>> {
  const parsed = corregirPagadoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_corregir_resultado_pagado", {
    p_admin_id: session.userId,
    p_evento_id: parsed.data.eventoId,
    p_resultado: parsed.data.resultado,
    p_motivo: parsed.data.motivo,
    p_forzar: parsed.data.forzar ?? false,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}

/** Una línea del historial de un jugador, para la hoja de Excel. */
export interface MovimientoUsuario {
  /** ISO. Se formatea en calendario de Perú al escribir el Excel. */
  fecha: string;
  nickname: string;
  /** Depósito · Retiro · Apuesta · Ajuste. Es la columna por la que se filtra. */
  tipo: string;
  /** Cómo entró o salió: "Yape con comprobante", "Efectivo", "Ganó", … */
  detalle: string;
  /** Positivo entra al jugador, negativo sale. */
  monto: number;
  /** Movió saldo fake, no plata. Se marca para no sumarlo con lo real. */
  esFake: boolean;
}

/**
 * Historial de movimientos de TODOS los jugadores en un rango de fechas:
 * cómo depositaron, cuándo retiraron y qué apuestas ganaron o perdieron.
 *
 * Las apuestas se leen de `apuestas` + `eventos` y no de `movimientos_saldo`
 * porque ahí una derrota no existe como fila: es una retención que nunca
 * volvió. Cruzando el lado de la apuesta con el resultado del evento sale
 * "Ganó"/"Perdió" directo, que es lo que se quiere leer en la hoja.
 *
 * El rango es en calendario de Perú, ambos días incluidos.
 */
export async function getMovimientosUsuarios(
  desde: string,
  hasta: string
): Promise<ActionResult<MovimientoUsuario[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const inicio = inicioDeDiaEnPeru(desde).toISOString();
  // El día final entero: hasta el arranque del día siguiente.
  const finDate = new Date(inicioDeDiaEnPeru(hasta).getTime() + 24 * 60 * 60 * 1000);
  const fin = finDate.toISOString();

  const admin = createSupabaseAdminClient();

  const [perfiles, recargas, ingresos, retiros, apuestas, ajustes] = await Promise.all([
    admin.from("perfiles").select("id, nickname"),
    admin
      .from("recargas")
      .select("usuario_id, monto_acreditado, revisado_at")
      .eq("estado", "aprobada")
      .gte("revisado_at", inicio)
      .lt("revisado_at", fin),
    admin
      .from("ingresos_manuales")
      .select("usuario_id, concepto, monto, created_at")
      .gte("created_at", inicio)
      .lt("created_at", fin),
    admin
      .from("retiros")
      .select("usuario_id, monto, revisado_at")
      .eq("estado", "pagado")
      .gte("revisado_at", inicio)
      .lt("revisado_at", fin),
    admin
      .from("apuestas")
      .select("usuario_id, evento_id, lado, monto_total, monto_matcheado, es_fake, created_at")
      .gte("created_at", inicio)
      .lt("created_at", fin),
    admin
      .from("ajustes_saldo")
      .select("usuario_id, saldo_anterior, saldo_nuevo, motivo, es_fake, created_at")
      .gte("created_at", inicio)
      .lt("created_at", fin),
  ]);

  const nick = new Map((perfiles.data ?? []).map((p) => [p.id, p.nickname]));
  const quien = (id: string) => nick.get(id) ?? "—";

  const filas: MovimientoUsuario[] = [];

  for (const r of recargas.data ?? []) {
    filas.push({
      fecha: r.revisado_at ?? "",
      nickname: quien(r.usuario_id),
      tipo: "Depósito",
      detalle: "Recarga por Yape (con comprobante)",
      monto: Number(r.monto_acreditado ?? 0),
      esFake: false,
    });
  }

  for (const i of ingresos.data ?? []) {
    if (!i.usuario_id) continue;
    filas.push({
      fecha: i.created_at,
      nickname: quien(i.usuario_id),
      tipo: "Depósito",
      detalle: `Registrado a mano — ${i.concepto}`,
      monto: Number(i.monto ?? 0),
      esFake: false,
    });
  }

  for (const t of retiros.data ?? []) {
    filas.push({
      fecha: t.revisado_at ?? "",
      nickname: quien(t.usuario_id),
      tipo: "Retiro",
      detalle: "Yapeado al jugador",
      monto: -Number(t.monto ?? 0),
      esFake: false,
    });
  }

  for (const a of ajustes.data ?? []) {
    const delta = Number(a.saldo_nuevo ?? 0) - Number(a.saldo_anterior ?? 0);
    filas.push({
      fecha: a.created_at,
      nickname: quien(a.usuario_id),
      tipo: a.es_fake ? "Saldo fake" : "Ajuste",
      detalle: a.motivo,
      monto: delta,
      esFake: a.es_fake,
    });
  }

  // Las apuestas necesitan el resultado del evento para saber si ganó o
  // perdió; se piden solo los eventos tocados por el rango.
  const eventoIds = [...new Set((apuestas.data ?? []).map((a) => a.evento_id))];
  const eventosPorId = new Map<string, { nombre: string; estado: string; resultado: string | null }>();
  if (eventoIds.length > 0) {
    const { data: eventos } = await admin
      .from("eventos")
      .select("id, nombre, estado, resultado")
      .in("id", eventoIds);
    for (const e of eventos ?? []) {
      eventosPorId.set(e.id, { nombre: e.nombre, estado: e.estado, resultado: e.resultado });
    }
  }

  for (const a of apuestas.data ?? []) {
    const evento = eventosPorId.get(a.evento_id);
    const matcheado = Number(a.monto_matcheado ?? 0);
    const total = Number(a.monto_total ?? 0);

    if (!evento || evento.estado !== "resuelto" || !evento.resultado) {
      filas.push({
        fecha: a.created_at,
        nickname: quien(a.usuario_id),
        tipo: "Apuesta",
        detalle: `${evento?.nombre ?? "Partida"} — sin resolver`,
        monto: -total,
        esFake: a.es_fake,
      });
      continue;
    }

    const gano = evento.resultado === a.lado;
    filas.push({
      fecha: a.created_at,
      nickname: quien(a.usuario_id),
      tipo: "Apuesta",
      detalle: `${evento.nombre} — ${gano ? "GANÓ" : "PERDIÓ"}`,
      // Neto de la mano: si ganó cobra 1.80 y había puesto lo emparejado.
      monto: gano
        ? Math.round(matcheado * 0.8 * 100) / 100
        : -matcheado,
      esFake: a.es_fake,
    });
  }

  filas.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0));
  return { ok: true, data: filas };
}

export interface PagoManualConAdmin {
  pago: PagoManual;
  adminNickname: string;
}

/** Historial de pagos manuales, más reciente primero. */
export async function getPagosManuales(): Promise<ActionResult<PagoManualConAdmin[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: pagos, error } = await admin
    .from("pagos_manuales")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!pagos || pagos.length === 0) return { ok: true, data: [] };

  const adminIds = [...new Set(pagos.map((p) => p.admin_id))];
  const { data: perfiles } = await admin.from("perfiles").select("id, nickname").in("id", adminIds);
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: pagos.map((p) => ({
      pago: p as PagoManual,
      adminNickname: nicknamePorId.get(p.admin_id) ?? "—",
    })),
  };
}

/**
 * Fija el saldo_disponible de un jugador a mano. Es una CORRECCIÓN, no un
 * ingreso: no cuenta como depósito ni sube el total esperado. 0044 revierte
 * la regla de 0042 — con `registrarIngreso` existiendo, que ambos contaran
 * lleva a registrar el mismo dinero dos veces.
 *
 * Consecuencia: subirle el saldo a alguien sin que haya entrado plata sale
 * de tu lado, y así se ve en el panel, porque "lo tuyo" se calcula como
 * total esperado − saldos de jugadores.
 *
 *   - ¿Recibiste plata y le das saldo?  -> `registrarIngreso`
 *   - ¿Saldo que NO es plata?           -> `darSaldoFake`
 *   - ¿Corregir un número mal puesto?   -> esta
 *
 * No toca `saldo_retenido`: lo que está en una apuesta viva no se mueve
 * desde acá.
 */
export async function ajustarSaldo(input: AjustarSaldoInput): Promise<ActionResult<Perfil>> {
  const parsed = ajustarSaldoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_ajustar_saldo", {
    p_admin_id: session.userId,
    p_usuario_id: parsed.data.usuarioId,
    p_nuevo_saldo: parsed.data.nuevoSaldo,
    p_motivo: parsed.data.motivo,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Perfil };
}

/**
 * Le da (o le quita, con monto negativo) saldo FAKE a un jugador — plata de
 * mentira que sirve para que haya con quién emparejar, pero que no cuenta
 * como depósito, no se puede retirar y no entra en "En Yape deberías
 * tener". Es lo contrario de `ajustarSaldo`: acá el monto SUMA al saldo
 * fake en vez de fijar un valor.
 *
 * Ojo con lo que sí cuesta plata: si un jugador REAL le gana a una apuesta
 * pagada con este saldo, el premio de 1.80 sale de la ganancia de la casa
 * (−0.80 por sol emparejado). Ver la cuenta completa en 0036_saldo_fake.sql.
 */
export async function darSaldoFake(input: DarSaldoFakeInput): Promise<ActionResult<Perfil>> {
  const parsed = darSaldoFakeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_dar_saldo_fake", {
    p_admin_id: session.userId,
    p_usuario_id: parsed.data.usuarioId,
    p_monto: parsed.data.monto,
    p_motivo: parsed.data.motivo,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Perfil };
}

export interface AjusteSaldoConNombres {
  ajuste: AjusteSaldo;
  adminNickname: string;
  usuarioNickname: string;
}

export async function getAjustesSaldo(): Promise<ActionResult<AjusteSaldoConNombres[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: ajustes, error } = await admin
    .from("ajustes_saldo")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!ajustes || ajustes.length === 0) return { ok: true, data: [] };

  const ids = [...new Set([...ajustes.map((a) => a.admin_id), ...ajustes.map((a) => a.usuario_id)])];
  const { data: perfiles } = await admin.from("perfiles").select("id, nickname").in("id", ids);
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: ajustes.map((a) => ({
      ajuste: a as AjusteSaldo,
      adminNickname: nicknamePorId.get(a.admin_id) ?? "—",
      usuarioNickname: nicknamePorId.get(a.usuario_id) ?? "—",
    })),
  };
}

/**
 * Corrección +/- a "En Yape deberías tener" — para cuando ese número ya
 * quedó mal por algo que no pasa por el flujo normal (ej. se aprobó una
 * recarga de prueba, inflando recargas_aprobadas sin que haya entrado
 * plata real). No mueve saldo de nadie, solo el reporte.
 */
export async function registrarAjusteYape(
  input: RegistrarAjusteYapeInput
): Promise<ActionResult<AjusteYape>> {
  const parsed = registrarAjusteYapeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_registrar_ajuste_yape", {
    p_admin_id: session.userId,
    p_monto: parsed.data.monto,
    p_motivo: parsed.data.motivo,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as AjusteYape };
}

export interface AjusteYapeConAdmin {
  ajuste: AjusteYape;
  adminNickname: string;
}

export async function getAjustesYape(): Promise<ActionResult<AjusteYapeConAdmin[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: ajustes, error } = await admin
    .from("ajustes_yape")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!ajustes || ajustes.length === 0) return { ok: true, data: [] };

  const adminIds = [...new Set(ajustes.map((a) => a.admin_id))];
  const { data: perfiles } = await admin.from("perfiles").select("id, nickname").in("id", adminIds);
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: ajustes.map((a) => ({
      ajuste: a as AjusteYape,
      adminNickname: nicknamePorId.get(a.admin_id) ?? "—",
    })),
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
  /** Plata de mentira (0036) — no se puede retirar y no cuenta como depósito. */
  saldoFake: number;
  saldoFakeRetenido: number;
  baneado: boolean;
  baneadoMotivo: string | null;
  createdAt: string;
  /** IP desde la que se registró la cuenta (0033) — para bloquear abusos. */
  ipRegistro: string | null;
  /** Suma de recargas APROBADAS (plata real por Yape) — 0 si nunca depositó. */
  depositadoTotal: number;
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

  // Aparte y no con un join: `recargas` puede tener varias filas aprobadas
  // por usuario, así que se suma acá en vez de traer la tabla completa a
  // la UI. Sirve para ver de dónde salió el saldo de cada uno.
  const { data: recargas } = await admin
    .from("recargas")
    .select("usuario_id, monto_acreditado")
    .eq("estado", "aprobada");
  const depositadoPorUsuario = new Map<string, number>();
  for (const r of recargas ?? []) {
    const previo = depositadoPorUsuario.get(r.usuario_id) ?? 0;
    depositadoPorUsuario.set(r.usuario_id, previo + Number(r.monto_acreditado ?? 0));
  }

  // La plata que entró por fuera del flujo de recargas también es depósito
  // de esa persona (0044). Los ajustes de saldo NO: son correcciones, no
  // plata que entró.
  const { data: ingresos } = await admin
    .from("ingresos_manuales")
    .select("usuario_id, monto")
    .not("usuario_id", "is", null);
  for (const i of ingresos ?? []) {
    if (!i.usuario_id) continue;
    const previo = depositadoPorUsuario.get(i.usuario_id) ?? 0;
    depositadoPorUsuario.set(i.usuario_id, previo + Number(i.monto ?? 0));
  }

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
      saldoFake: Number(p.saldo_fake ?? 0),
      saldoFakeRetenido: Number(p.saldo_fake_retenido ?? 0),
      baneado: p.baneado,
      baneadoMotivo: p.baneado_motivo,
      createdAt: p.created_at,
      ipRegistro: p.ip_registro,
      depositadoTotal: Math.round((depositadoPorUsuario.get(p.id) ?? 0) * 100) / 100,
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

/**
 * Cancela un título por completo — para un imprevisto, no para decidir un
 * ganador. Devuelve a todos su plata (emparejada incluida) sin comisión ni
 * puntos. Disponible en cualquier momento antes de confirmar el pago,
 * incluso con un resultado ya declarado — ver 0029_cancelar_evento.sql.
 */
export async function cancelarEvento(input: CancelarEventoInput): Promise<ActionResult<Evento>> {
  const parsed = cancelarEventoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cancelar_evento", {
    p_admin_id: session.userId,
    p_evento_id: parsed.data.eventoId,
    p_motivo: parsed.data.motivo ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}

/**
 * Herramienta de pruebas: borra un título YA RESUELTO junto con sus
 * apuestas, emparejamientos, comisión y movimientos de saldo, revirtiendo
 * su efecto en el saldo y puntos de cada jugador que apostó ahí — como si
 * nunca hubiera pasado. Ver 0027_eliminar_evento_prueba_y_revertir_retiro.sql.
 */
export async function eliminarEventoPrueba(
  input: EliminarEventoPruebaInput
): Promise<ActionResult<null>> {
  if (!HERRAMIENTAS_PRUEBA) {
    return { ok: false, error: "Las herramientas de prueba están desactivadas." };
  }

  const parsed = eliminarEventoPruebaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("admin_eliminar_evento_prueba", {
    p_admin_id: session.userId,
    p_evento_id: parsed.data.eventoId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/** Blackjack: deja la mesa como recién sentados — para repetir la mano o
 * deshacer un "me planto" marcado por error. No toca apuestas ni saldo. */
export async function reiniciarTurnos(eventoId: string): Promise<ActionResult<Evento>> {
  const parsed = z.string().uuid("Mesa inválida.").safeParse(eventoId);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_reiniciar_turnos", {
    p_admin_id: session.userId,
    p_evento_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Evento };
}
