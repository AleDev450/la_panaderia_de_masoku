"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { InscripcionSorteo, Sorteo } from "@/lib/supabase/types";
import { ActionResult } from "@/actions/betting";

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

/**
 * Steam acepta varias formas de perfil (/id/vanity, /profiles/7656…, con o
 * sin barra final, con o sin https). Se valida solo el dominio: ser más
 * estricto acá rebota gente que pegó el link correcto, y el premio se
 * entrega a mano igual.
 */
const steamUrl = z
  .string()
  .trim()
  .min(1, "Pega tu link de Steam.")
  .max(300, "Ese link es demasiado largo.")
  .refine((v) => v.toLowerCase().includes("steamcommunity.com"), {
    message: "El link debe ser tu perfil de steamcommunity.com.",
  });

const inscribirseSchema = z.object({
  sorteoId: z.string().uuid("Sorteo inválido."),
  discord: z
    .string()
    .trim()
    .min(2, "Indica tu usuario de Discord.")
    .max(60, "Máximo 60 caracteres."),
  steamUrl,
});
export type InscribirseSorteoInput = z.infer<typeof inscribirseSchema>;

const guardarSorteoSchema = z.object({
  sorteoId: z.string().uuid().nullable().optional(),
  nombre: z.string().trim().min(3, "Ponle un nombre al sorteo.").max(120, "Máximo 120 caracteres."),
  premio: z.string().trim().min(2, "Indica qué se sortea.").max(120, "Máximo 120 caracteres."),
  instrucciones: z.string().trim().max(2000, "Máximo 2000 caracteres.").optional(),
  /** ISO `YYYY-MM-DD`, o vacío si todavía no hay fecha. */
  fechaSorteo: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").optional().or(z.literal("")),
  activo: z.boolean(),
});
export type GuardarSorteoInput = z.infer<typeof guardarSorteoSchema>;

const marcarGanadorSchema = z.object({
  inscripcionId: z.string().uuid("Inscripción inválida."),
  ganador: z.boolean(),
});
export type MarcarGanadorInput = z.infer<typeof marcarGanadorSchema>;

const asignarTicketsSchema = z.object({
  inscripcionId: z.string().uuid("Inscripción inválida."),
  tickets: z
    .number()
    .int("Los tickets son un número entero.")
    .min(0, "Los tickets no pueden ser negativos.")
    .max(1000, "Máximo 1000 tickets por persona."),
});
export type AsignarTicketsInput = z.infer<typeof asignarTicketsSchema>;

export interface SorteoConInscripcion {
  sorteo: Sorteo;
  /** La inscripción de quien pide, si ya se anotó. */
  miInscripcion: InscripcionSorteo | null;
  inscritos: number;
}

/**
 * Lo que ve el jugador en /sorteos: los sorteos abiertos, cuántos van
 * anotados y si él ya está dentro (para mostrarle su link y dejarlo
 * corregirlo).
 */
export async function getSorteos(): Promise<ActionResult<SorteoConInscripcion[]>> {
  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: sorteos, error } = await admin
    .from("sorteos")
    .select("*")
    .order("activo", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  if (!sorteos || sorteos.length === 0) return { ok: true, data: [] };

  // Las dos consultas van sobre todos los sorteos de una vez, no una por
  // sorteo: son pocos y así no se multiplican los viajes a Postgres.
  const ids = sorteos.map((s) => s.id);
  const [{ data: mias }, { data: todas }] = await Promise.all([
    admin
      .from("inscripciones_sorteo")
      .select("*")
      .eq("usuario_id", session.userId)
      .in("sorteo_id", ids),
    admin.from("inscripciones_sorteo").select("sorteo_id").in("sorteo_id", ids),
  ]);

  const miaPorSorteo = new Map((mias ?? []).map((i) => [i.sorteo_id, i as InscripcionSorteo]));
  const conteo = new Map<string, number>();
  for (const i of todas ?? []) {
    conteo.set(i.sorteo_id, (conteo.get(i.sorteo_id) ?? 0) + 1);
  }

  return {
    ok: true,
    data: (sorteos as Sorteo[]).map((sorteo) => ({
      sorteo,
      miInscripcion: miaPorSorteo.get(sorteo.id) ?? null,
      inscritos: conteo.get(sorteo.id) ?? 0,
    })),
  };
}

/**
 * Es un upsert: volver a enviar el formulario corrige el link en vez de
 * rebotar con "ya estás inscrito" (ver 0037_sorteos.sql).
 */
export async function inscribirseSorteo(
  input: InscribirseSorteoInput
): Promise<ActionResult<InscripcionSorteo>> {
  const parsed = inscribirseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireSessionUserId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("inscribirse_sorteo", {
    p_usuario_id: session.userId,
    p_sorteo_id: parsed.data.sorteoId,
    p_discord: parsed.data.discord,
    p_steam_url: parsed.data.steamUrl,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InscripcionSorteo };
}

/** Admin-only: crea uno nuevo (sin `sorteoId`) o edita el que se le pase. */
export async function guardarSorteo(input: GuardarSorteoInput): Promise<ActionResult<Sorteo>> {
  const parsed = guardarSorteoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_guardar_sorteo", {
    p_admin_id: session.userId,
    p_sorteo_id: parsed.data.sorteoId ?? null,
    p_nombre: parsed.data.nombre,
    p_premio: parsed.data.premio,
    p_instrucciones: parsed.data.instrucciones ?? null,
    p_fecha_sorteo: parsed.data.fechaSorteo ? parsed.data.fechaSorteo : null,
    p_activo: parsed.data.activo,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Sorteo };
}

export interface InscripcionConUsuario {
  inscripcion: InscripcionSorteo;
  usuario: { nickname: string; fullName: string | null; phone: string | null };
}

/** Admin-only: la lista de inscritos de un sorteo, para elegir al ganador. */
export async function getInscripciones(
  sorteoId: string
): Promise<ActionResult<InscripcionConUsuario[]>> {
  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data: inscripciones, error } = await admin
    .from("inscripciones_sorteo")
    .select("*")
    .eq("sorteo_id", sorteoId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  if (!inscripciones || inscripciones.length === 0) return { ok: true, data: [] };

  const usuarioIds = [...new Set(inscripciones.map((i) => i.usuario_id))];
  const { data: perfiles } = await admin
    .from("perfiles")
    .select("id, nickname, full_name, phone")
    .in("id", usuarioIds);
  const perfilPorId = new Map((perfiles ?? []).map((p) => [p.id, p]));

  return {
    ok: true,
    data: inscripciones.map((inscripcion) => {
      const perfil = perfilPorId.get(inscripcion.usuario_id);
      return {
        inscripcion: inscripcion as InscripcionSorteo,
        usuario: {
          nickname: perfil?.nickname ?? "—",
          fullName: perfil?.full_name ?? null,
          phone: perfil?.phone ?? null,
        },
      };
    }),
  };
}

/** Admin-only. Se permite más de un ganador: puedes tener varios cofres. */
export async function marcarGanador(
  input: MarcarGanadorInput
): Promise<ActionResult<InscripcionSorteo>> {
  const parsed = marcarGanadorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_marcar_ganador", {
    p_admin_id: session.userId,
    p_inscripcion_id: parsed.data.inscripcionId,
    p_ganador: parsed.data.ganador,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InscripcionSorteo };
}

/**
 * Admin-only: cuántas chances tiene esa persona en el sorteo. El tier del
 * bundle (brillante / holográfico / dorado) se verifica por fuera, así que
 * acá solo se guarda el número que el admin escribe.
 */
export async function asignarTickets(
  input: AsignarTicketsInput
): Promise<ActionResult<InscripcionSorteo>> {
  const parsed = asignarTicketsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_asignar_tickets", {
    p_admin_id: session.userId,
    p_inscripcion_id: parsed.data.inscripcionId,
    p_tickets: parsed.data.tickets,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InscripcionSorteo };
}

/**
 * Admin-only: saca un ganador al azar ponderado por tickets — con 6 tickets
 * tienes seis veces la chance de alguien con 1. El sorteo ocurre en
 * Postgres, no acá: desde el cliente cualquiera podría volver a tirar hasta
 * que salga quien quiere (ver 0038).
 *
 * Solo entran los que todavía no ganaron, así que volver a apretarlo saca
 * un segundo ganador — útil cuando hay varios cofres.
 */
export async function sortearGanador(sorteoId: string): Promise<ActionResult<InscripcionSorteo>> {
  const parsed = z.string().uuid("Sorteo inválido.").safeParse(sorteoId);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_sortear_ganador", {
    p_admin_id: session.userId,
    p_sorteo_id: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InscripcionSorteo };
}
