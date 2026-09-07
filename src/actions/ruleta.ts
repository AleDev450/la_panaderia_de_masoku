"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CachudobetConfig,
  ModoRonda,
  RuletaRonda,
  RuletaTicket,
} from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

/**
 * Ruleta CACHUDOBET (0048). Igual que el resto del proyecto: acá no se
 * calcula plata ni se elige ganador — se valida la entrada, se resuelve quién
 * llama desde la cookie de sesión y se delega en los RPC de Postgres.
 *
 * Todas las lecturas devuelven además `servidorAhora`, el `now()` de Postgres.
 * Es lo que le permite al cliente medir la animación contra el mismo reloj que
 * fijó `giro_inicia_en` en vez de contra el suyo.
 */

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

async function requireAdminId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", session.userId)
    .single();
  if (perfil?.rol !== "admin") return { ok: false, error: "No autorizado." };

  return { ok: true, userId: session.userId };
}

const comprarTicketsSchema = z.object({
  rondaId: z.string().uuid("Ronda inválida."),
  monto: z
    .number()
    .positive("El monto debe ser mayor a 0.")
    .max(100000, "Ese monto es demasiado alto.")
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "El monto admite máximo 2 decimales.",
    }),
});
export type ComprarTicketsInput = z.infer<typeof comprarTicketsSchema>;

const guardarRondaSchema = z.object({
  rondaId: z.string().uuid().nullable().optional(),
  nombre: z.string().trim().min(3, "Ponle un nombre a la ronda.").max(120, "Máximo 120 caracteres."),
  premioConcepto: z.string().trim().max(200, "Máximo 200 caracteres.").optional(),
  /** Con qué animación se sortea (0058). Sin esto, el panel de caballitos
   * crearía rondas de ruleta sin darse cuenta. */
  modo: z.enum(["ruleta", "carrera"]).optional(),
  /** Precio del ticket de ESTA ronda (0060). Sin valor, manda la config.
   * Postgres lo rechaza si ya se vendió alguno. */
  precioTicket: z
    .number()
    .positive("El precio del ticket debe ser mayor a 0.")
    .max(1000, "Un ticket no puede costar más de S/1000.")
    .optional(),
  /**
   * Tope de tickets por persona (0063). `null` lo quita.
   *
   * Es `nullable` y no solo `optional` a propósito: "no lo mandes" y "déjalo
   * sin tope" son cosas distintas, y al editar hay que poder quitarlo.
   */
  maxTickets: z
    .number()
    .int("El tope es un número entero.")
    .min(1, "El tope debe ser al menos 1.")
    .max(10000, "Ese tope es demasiado alto.")
    .nullable()
    .optional(),
});
export type GuardarRondaInput = z.infer<typeof guardarRondaSchema>;

const cambiarEstadoSchema = z.object({
  rondaId: z.string().uuid("Ronda inválida."),
  estado: z.enum(["abierta", "cerrada"]),
});
export type CambiarEstadoRondaInput = z.infer<typeof cambiarEstadoSchema>;

const agregarTicketsSchema = z.object({
  rondaId: z.string().uuid("Ronda inválida."),
  usuarioId: z.string().uuid("Jugador inválido."),
  cantidad: z
    .number()
    .int("La cantidad es un número entero.")
    .min(1, "Al menos un ticket.")
    .max(500, "Máximo 500 tickets por operación."),
});
export type AgregarTicketsInput = z.infer<typeof agregarTicketsSchema>;

const guardarConfigSchema = z.object({
  precioTicket: z.number().positive("El precio del ticket debe ser mayor a 0."),
  porcentajePremio: z
    .number()
    .min(0, "El porcentaje va entre 0 y 100.")
    .max(100, "El porcentaje va entre 0 y 100."),
  caraSelloMultiplicador: z.number().gt(1, "El multiplicador debe ser mayor a 1."),
  caraSelloMin: z.number().positive("El mínimo debe ser mayor a 0."),
  caraSelloMax: z.number().positive("El máximo debe ser mayor a 0."),
  /** Reloj de la ruleta libre (0066). Opcionales: una llamada que no los
   * mande deja los valores actuales en vez de pisarlos. */
  libreMinutos: z
    .number()
    .int("Los minutos son un número entero.")
    .min(1, "El reloj no puede ser menor a 1 minuto.")
    .max(1440, "El reloj no puede pasar de 24 horas.")
    .optional(),
  libreMinJugadores: z
    .number()
    .int("Los jugadores son un número entero.")
    .min(2, "Hacen falta al menos 2 jugadores para que arranque el reloj.")
    .optional(),
});
export type GuardarConfigInput = z.infer<typeof guardarConfigSchema>;

export interface ParticipanteRonda {
  usuarioId: string;
  nickname: string;
  tickets: number;
}

export interface GanadorRonda {
  usuarioId: string;
  nickname: string;
  codigo: string;
}

export interface RondaResumen {
  ronda: RuletaRonda;
  /** Ordenados por su primer ticket: la rueda tiene que quedar igual en
   * todas las pantallas, así que el orden no puede depender de un Map. */
  participantes: ParticipanteRonda[];
  totalTickets: number;
  ganador: GanadorRonda | null;
}

export interface VistaRuleta {
  /**
   * TODAS las ruletas vivas, de la más nueva a la más vieja.
   *
   * Antes se devolvía solo la última y el resto quedaba invisible: si el staff
   * abría dos, la primera dejaba de existir para el jugador aunque siguiera
   * aceptando tickets.
   */
  rondas: RondaResumen[];
  /** La primera de `rondas` — o la última finalizada si no hay ninguna viva.
   * Es la que muestra el resumen del inicio, que enseña una sola. */
  ronda: RondaResumen | null;
  config: CachudobetConfig;
  /** Tickets de quien pide, en la ronda que se está mostrando. */
  misTickets: number;
  /** `now()` de Postgres: el reloj contra el que se mide la animación. */
  servidorAhora: string;
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** El `now()` de Postgres, con el reloj de Node como red de seguridad si el
 * RPC todavía no existe (migración sin correr). */
async function servidorAhora(admin: Admin): Promise<string> {
  const { data } = await admin.rpc("ahora_servidor");
  return typeof data === "string" ? data : new Date().toISOString();
}

/** Arma participantes + ganador de una ronda. Una sola pasada por los tickets:
 * son muchas filas (una por ticket) y esto corre en cada poll. */
async function resumenDeRonda(admin: Admin, ronda: RuletaRonda): Promise<RondaResumen> {
  const { data: tickets } = await admin
    .from("ruleta_tickets")
    .select("id, usuario_id, numero, codigo")
    .eq("ronda_id", ronda.id)
    .order("numero", { ascending: true });

  const filas = tickets ?? [];
  const conteo = new Map<string, number>();
  for (const t of filas) {
    conteo.set(t.usuario_id, (conteo.get(t.usuario_id) ?? 0) + 1);
  }

  const usuarioIds = [...conteo.keys()];
  if (ronda.ganador_usuario_id && !conteo.has(ronda.ganador_usuario_id)) {
    usuarioIds.push(ronda.ganador_usuario_id);
  }

  const { data: perfiles } = usuarioIds.length
    ? await admin.from("perfiles").select("id, nickname").in("id", usuarioIds)
    : { data: [] };
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  // El orden lo da el primer ticket de cada uno, que es el orden en que
  // aparecieron: estable y reproducible en cualquier navegador.
  const participantes: ParticipanteRonda[] = [];
  const vistos = new Set<string>();
  for (const t of filas) {
    if (vistos.has(t.usuario_id)) continue;
    vistos.add(t.usuario_id);
    participantes.push({
      usuarioId: t.usuario_id,
      nickname: nicknamePorId.get(t.usuario_id) ?? "—",
      tickets: conteo.get(t.usuario_id) ?? 0,
    });
  }

  const ticketGanador = ronda.ganador_ticket_id
    ? filas.find((t) => t.id === ronda.ganador_ticket_id)
    : null;

  return {
    ronda,
    participantes,
    totalTickets: filas.length,
    ganador:
      ronda.ganador_usuario_id && ticketGanador
        ? {
            usuarioId: ronda.ganador_usuario_id,
            nickname: nicknamePorId.get(ronda.ganador_usuario_id) ?? "—",
            codigo: ticketGanador.codigo,
          }
        : null,
  };
}

/**
 * La ronda que le toca ver al jugador: la que está en juego y, si no hay
 * ninguna, la última finalizada — para que el ganador siga en pantalla un
 * rato después del giro en vez de desaparecer.
 */
export async function getRuleta(): Promise<ActionResult<VistaRuleta>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();

  const [{ data: config, error: errorConfig }, ahora] = await Promise.all([
    admin.from("cachudobet_config").select("*").single(),
    servidorAhora(admin),
  ]);
  if (errorConfig || !config) {
    return { ok: false, error: errorConfig?.message ?? "Falta la configuración de CACHUDOBET." };
  }

  // El filtro por modo es lo que mantiene separados los dos juegos: sin él,
  // la ruleta mostraría una ronda de caballitos y viceversa (0058).
  // TODAS las vivas, no solo la última: el staff puede tener varias abiertas a
  // la vez y antes solo se veía una.
  const { data: enJuego, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    // Las dos ruletas: la semanal del staff y las libres de los jugadores
    // (0064). Comparten pantalla y rueda; se distinguen por el `modo`.
    .in("modo", ["ruleta", "libre"])
    .in("estado", ["abierta", "cerrada", "girando"])
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  /**
   * Activas son las ABIERTAS y las CERRADAS listas para girar.
   *
   * `girando` se deja pasar solo mientras la animación de verdad está
   * corriendo. Es un estado de tránsito que dura segundos, pero la ronda se
   * queda ahí hasta que el staff aprieta "Finalizar" — y si se olvida, esa
   * ronda quedaría para siempre en la lista de activas ensuciándola. El
   * minuto de margen alcanza de sobra para los 8 segundos que dura el giro,
   * incluso en un teléfono lento.
   */
  const ahoraMs = new Date(ahora).getTime();
  let vivas = ((enJuego ?? []) as RuletaRonda[]).filter((r) => {
    if (r.estado !== "girando") return true;
    if (!r.giro_inicia_en) return false;
    return ahoraMs - new Date(r.giro_inicia_en).getTime() < 60_000;
  });

  // Sin ninguna viva se muestra la última que se jugó, para que la pantalla no
  // quede en blanco después de un sorteo.
  if (vivas.length === 0) {
    const { data: ultima } = await admin
      .from("ruleta_rondas")
      .select("*")
      .in("modo", ["ruleta", "libre"])
      .eq("estado", "finalizada")
      .order("finalizada_at", { ascending: false })
      .limit(1);
    vivas = (ultima ?? []) as RuletaRonda[];
  }

  if (vivas.length === 0) {
    return {
      ok: true,
      data: {
        rondas: [],
        ronda: null,
        config: config as CachudobetConfig,
        misTickets: 0,
        servidorAhora: ahora,
      },
    };
  }

  const rondas = await Promise.all(vivas.map((r) => resumenDeRonda(admin, r)));
  const misTickets =
    rondas[0].participantes.find((p) => p.usuarioId === session.userId)?.tickets ?? 0;

  return {
    ok: true,
    data: {
      rondas,
      ronda: rondas[0],
      config: config as CachudobetConfig,
      misTickets,
      servidorAhora: ahora,
    },
  };
}

export interface VistaCaballitos {
  ronda: RondaResumen | null;
  config: CachudobetConfig;
  misTickets: number;
  servidorAhora: string;
  /**
   * Los tickets sueltos de la ronda: CADA UNO ES UN CABALLO.
   *
   * Van aparte del resumen —que agrupa por persona para la rueda— porque la
   * carrera necesita las filas una por una: el `id` de cada ticket es el
   * caballo, y `ganador_ticket_id` apunta justo a ese id.
   */
  tickets: { id: string; usuarioId: string; nickname: string }[];
}

/**
 * La ronda de caballitos en curso (0058).
 *
 * Es la MISMA mecánica que la ruleta: mismas rondas, mismos tickets, mismo
 * pozo y mismo sorteo. Lo único que cambia es el `modo`, que decide si el
 * resultado se muestra girando una rueda o corriendo una carrera.
 */
export async function getCaballitos(): Promise<ActionResult<VistaCaballitos>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();

  const [{ data: config, error: errorConfig }, ahora] = await Promise.all([
    admin.from("cachudobet_config").select("*").single(),
    servidorAhora(admin),
  ]);
  if (errorConfig || !config) {
    return { ok: false, error: errorConfig?.message ?? "Falta la configuración de CACHUDOBET." };
  }

  const { data: enJuego, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    .eq("modo", "carrera")
    .in("estado", ["abierta", "cerrada", "girando"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { ok: false, error: error.message };

  let ronda = (enJuego ?? [])[0] as RuletaRonda | undefined;
  if (!ronda) {
    const { data: ultima } = await admin
      .from("ruleta_rondas")
      .select("*")
      .eq("modo", "carrera")
      .eq("estado", "finalizada")
      .order("finalizada_at", { ascending: false })
      .limit(1);
    ronda = (ultima ?? [])[0] as RuletaRonda | undefined;
  }

  const vacia = {
    ronda: null,
    config: config as CachudobetConfig,
    misTickets: 0,
    servidorAhora: ahora,
    tickets: [],
  };
  if (!ronda) return { ok: true, data: vacia };

  const resumen = await resumenDeRonda(admin, ronda);
  const misTickets =
    resumen.participantes.find((p) => p.usuarioId === session.userId)?.tickets ?? 0;

  // `created_at` y no el id: el orden de los caballos tiene que ser el mismo
  // en todas las pantallas, y el de compra es el único estable.
  const { data: filas } = await admin
    .from("ruleta_tickets")
    .select("id, usuario_id")
    .eq("ronda_id", ronda.id)
    .order("created_at", { ascending: true });

  const nick = new Map(resumen.participantes.map((p) => [p.usuarioId, p.nickname]));

  return {
    ok: true,
    data: {
      ronda: resumen,
      config: config as CachudobetConfig,
      misTickets,
      servidorAhora: ahora,
      tickets: (filas ?? []).map((t) => ({
        id: t.id,
        usuarioId: t.usuario_id,
        nickname: nick.get(t.usuario_id) ?? "—",
      })),
    },
  };
}

const crearLibreSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "Ponle un nombre a tu ruleta.")
    .max(80, "Máximo 80 caracteres."),
  /**
   * Mínimo S/1 (0065): por debajo de eso el pozo no llega a nada. El creador
   * entra con UN ticket a este precio — con cuántos entrar deja de
   * preguntarse, y quien quiera más los compra después como cualquiera.
   */
  precioTicket: z
    .number()
    .min(1, "El ticket tiene que costar al menos S/1.")
    .max(100, "En una ruleta libre el ticket no puede pasar de S/100."),
});
export type CrearRondaLibreInput = z.infer<typeof crearLibreSchema>;

/**
 * Un jugador abre su propia ruleta y entra con sus tickets (0064).
 *
 * Crear y comprar son una sola transacción en Postgres: si no le alcanza el
 * saldo, la ronda no llega a existir. Así no quedan salas vacías de gente que
 * quiso abrir una sin plata.
 */
export async function crearRondaLibre(
  input: CrearRondaLibreInput
): Promise<ActionResult<RuletaRonda>> {
  const parsed = crearLibreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("crear_ronda_libre", {
    p_usuario_id: session.userId,
    p_nombre: parsed.data.nombre,
    p_precio_ticket: parsed.data.precioTicket,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

/**
 * Dispara el giro automático de una ruleta libre.
 *
 * SIN pg_cron, EL RELOJ LO MIRA EL CLIENTE: cualquiera que tenga la pantalla
 * abierta y vea la hora vencida llama acá. Es seguro porque la función no
 * confía en quien llama — no gira antes de tiempo, y si otro se adelantó
 * devuelve la ronda ya girada en vez de fallar. Por eso esta acción tampoco
 * muestra el error al usuario: es una tarea de fondo, no una acción suya.
 */
export async function girarLibre(rondaId: string): Promise<ActionResult<RuletaRonda>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("girar_ruleta_libre", {
    p_ronda_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

/** Compra con saldo. El monto tiene que ser múltiplo exacto del precio del
 * ticket — lo revalida `comprar_tickets_ruleta`, esto es solo el mensaje
 * rápido. */
export async function comprarTickets(
  input: ComprarTicketsInput
): Promise<ActionResult<RuletaTicket[]>> {
  const parsed = comprarTicketsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("comprar_tickets_ruleta", {
    p_usuario_id: session.userId,
    p_ronda_id: parsed.data.rondaId,
    p_monto: parsed.data.monto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as RuletaTicket[] };
}

export interface RondaAdmin {
  ronda: RuletaRonda;
  totalTickets: number;
  participantes: number;
  /** Quién ganó, ya resuelto a nickname. Null mientras no se haya sorteado.
   * Viaja acá y no como id suelto para que la tabla no tenga que ir a
   * buscar un nombre por fila. */
  ganadorNickname: string | null;
}

/** Admin-only: todas las rondas, con lo que se necesita para la lista. */
export async function getRondas(modo?: ModoRonda): Promise<ActionResult<RondaAdmin[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  // Sin `modo` devuelve todas, para no romper a quien ya la llamaba así.
  const consulta = admin.from("ruleta_rondas").select("*");
  const { data: rondas, error } = await (modo ? consulta.eq("modo", modo) : consulta).order(
    "created_at",
    { ascending: false }
  );
  if (error) return { ok: false, error: error.message };
  if (!rondas || rondas.length === 0) return { ok: true, data: [] };

  // Un solo viaje para los tickets de todas las rondas, no uno por ronda.
  const { data: tickets } = await admin
    .from("ruleta_tickets")
    .select("ronda_id, usuario_id")
    .in(
      "ronda_id",
      rondas.map((r) => r.id)
    );

  const conteo = new Map<string, number>();
  const usuarios = new Map<string, Set<string>>();
  for (const t of tickets ?? []) {
    conteo.set(t.ronda_id, (conteo.get(t.ronda_id) ?? 0) + 1);
    if (!usuarios.has(t.ronda_id)) usuarios.set(t.ronda_id, new Set());
    usuarios.get(t.ronda_id)!.add(t.usuario_id);
  }

  // Un solo viaje por los nicknames de todos los ganadores, no uno por ronda.
  const ganadores = [
    ...new Set(
      (rondas as RuletaRonda[])
        .map((r) => r.ganador_usuario_id)
        .filter((id): id is string => id !== null)
    ),
  ];
  const { data: perfiles } = ganadores.length
    ? await admin.from("perfiles").select("id, nickname").in("id", ganadores)
    : { data: [] };
  const nick = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: (rondas as RuletaRonda[]).map((ronda) => ({
      ronda,
      totalTickets: conteo.get(ronda.id) ?? 0,
      participantes: usuarios.get(ronda.id)?.size ?? 0,
      ganadorNickname: ronda.ganador_usuario_id
        ? (nick.get(ronda.ganador_usuario_id) ?? "—")
        : null,
    })),
  };
}

/** Admin-only: el detalle de una ronda (participantes, tickets, ganador). */
export async function getDetalleRonda(
  rondaId: string
): Promise<ActionResult<RondaResumen>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: ronda, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    .eq("id", parsed.data)
    .single();
  if (error || !ronda) return { ok: false, error: error?.message ?? "Ronda no encontrada." };

  return { ok: true, data: await resumenDeRonda(admin, ronda as RuletaRonda) };
}

export async function guardarRonda(
  input: GuardarRondaInput
): Promise<ActionResult<RuletaRonda>> {
  const parsed = guardarRondaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_guardar_ronda", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data.rondaId ?? null,
    p_nombre: parsed.data.nombre,
    p_premio_concepto: parsed.data.premioConcepto || null,
    p_modo: parsed.data.modo ?? "ruleta",
    p_precio_ticket: parsed.data.precioTicket ?? null,
    p_max_tickets: parsed.data.maxTickets ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

/**
 * Cancela la ronda y le devuelve a todos lo que compraron (0061). Sirve igual
 * para ruleta y para caballitos: son la misma ronda con otro `modo`.
 *
 * Solo se devuelve lo COMPRADO — los tickets que el staff regaló nunca
 * salieron del saldo de nadie, y devolverlos sería crear plata. Eso lo decide
 * Postgres, acá no se calcula nada.
 */
export async function cancelarRonda(
  rondaId: string,
  motivo?: string
): Promise<ActionResult<RuletaRonda>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cancelar_ronda", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data,
    p_motivo: motivo?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

export async function cambiarEstadoRonda(
  input: CambiarEstadoRondaInput
): Promise<ActionResult<RuletaRonda>> {
  const parsed = cambiarEstadoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cambiar_estado_ronda", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data.rondaId,
    p_estado: parsed.data.estado,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

/** Admin-only: tickets pagados por fuera. No descuenta saldo (ver 0048). */
export async function agregarTickets(
  input: AgregarTicketsInput
): Promise<ActionResult<RuletaTicket[]>> {
  const parsed = agregarTicketsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_agregar_tickets", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data.rondaId,
    p_usuario_id: parsed.data.usuarioId,
    p_cantidad: parsed.data.cantidad,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as RuletaTicket[] };
}

/**
 * EL botón. El ganador se elige, se paga y se guarda dentro del RPC; recién
 * después se fija `giro_inicia_en`, así que para cuando el primer cliente se
 * entera de que hay que animar, el resultado ya está escrito en la base.
 *
 * Un segundo clic sobre la misma ronda lo rebota Postgres, no esta función.
 */
export async function girarRuleta(rondaId: string): Promise<ActionResult<RuletaRonda>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_girar_ruleta", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

/** Cierra la ronda para el historial. No mueve plata: el premio ya se pagó
 * al girar. */
export async function finalizarRonda(rondaId: string): Promise<ActionResult<RuletaRonda>> {
  const parsed = z.string().uuid("Ronda inválida.").safeParse(rondaId);
  if (!parsed.success) return { ok: false, error: "Ronda inválida." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_finalizar_ronda", {
    p_admin_id: session.userId,
    p_ronda_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RuletaRonda };
}

export async function getConfig(): Promise<ActionResult<CachudobetConfig>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("cachudobet_config").select("*").single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falta la configuración de CACHUDOBET." };
  }
  return { ok: true, data: data as CachudobetConfig };
}

export async function guardarConfig(
  input: GuardarConfigInput
): Promise<ActionResult<CachudobetConfig>> {
  const parsed = guardarConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (parsed.data.caraSelloMax < parsed.data.caraSelloMin) {
    return { ok: false, error: "El máximo de cara o sello no puede ser menor que el mínimo." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_guardar_config", {
    p_admin_id: session.userId,
    p_precio_ticket: parsed.data.precioTicket,
    p_porcentaje_premio: parsed.data.porcentajePremio,
    p_cara_sello_multiplicador: parsed.data.caraSelloMultiplicador,
    p_cara_sello_min: parsed.data.caraSelloMin,
    p_cara_sello_max: parsed.data.caraSelloMax,
    p_libre_minutos: parsed.data.libreMinutos ?? null,
    p_libre_min_jugadores: parsed.data.libreMinJugadores ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as CachudobetConfig };
}

export interface RondaHistorial {
  ronda: RuletaRonda;
  ganadorNickname: string | null;
  totalTickets: number;
  participantes: number;
}

/** Historial público de rondas ya sorteadas. */
export async function getHistorialRondas(): Promise<ActionResult<RondaHistorial[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: rondas, error } = await admin
    .from("ruleta_rondas")
    .select("*")
    .in("estado", ["girando", "finalizada"])
    .order("girada_at", { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };
  if (!rondas || rondas.length === 0) return { ok: true, data: [] };

  const ids = rondas.map((r) => r.id);
  const ganadorIds = [
    ...new Set(rondas.map((r) => r.ganador_usuario_id).filter((id): id is string => !!id)),
  ];

  const [{ data: tickets }, { data: perfiles }] = await Promise.all([
    admin.from("ruleta_tickets").select("ronda_id, usuario_id").in("ronda_id", ids),
    ganadorIds.length
      ? admin.from("perfiles").select("id, nickname").in("id", ganadorIds)
      : Promise.resolve({ data: [] as { id: string; nickname: string }[] }),
  ]);

  const conteo = new Map<string, number>();
  const usuarios = new Map<string, Set<string>>();
  for (const t of tickets ?? []) {
    conteo.set(t.ronda_id, (conteo.get(t.ronda_id) ?? 0) + 1);
    if (!usuarios.has(t.ronda_id)) usuarios.set(t.ronda_id, new Set());
    usuarios.get(t.ronda_id)!.add(t.usuario_id);
  }
  const nicknamePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nickname]));

  return {
    ok: true,
    data: (rondas as RuletaRonda[]).map((ronda) => ({
      ronda,
      ganadorNickname: ronda.ganador_usuario_id
        ? (nicknamePorId.get(ronda.ganador_usuario_id) ?? null)
        : null,
      totalTickets: conteo.get(ronda.id) ?? 0,
      participantes: usuarios.get(ronda.id)?.size ?? 0,
    })),
  };
}
