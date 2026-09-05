"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ActionResult } from "@/actions/betting";
import { UsuarioAdmin } from "@/actions/admin";
import { pagoPorMatcheado } from "@/lib/apuestas";

/**
 * La ficha de un jugador: todo lo que apostó, ganó y perdió en los cuatro
 * juegos, para la pantalla de detalle del panel.
 *
 * Vive en su propio archivo y no en `admin.ts` porque ese ya pasa las mil
 * líneas y esto no comparte nada con lo de ahí más que el guard de admin.
 */

async function requireAdminId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: "Debes iniciar sesión." };

  const admin = createSupabaseAdminClient();
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (perfil?.rol !== "admin") return { ok: false, error: "No autorizado." };

  return { ok: true, userId: user.id };
}

export type EstadoJugada = "ganada" | "perdida" | "en juego" | "sin cubrir";

/** Una jugada de cualquier juego, normalizada para poder listarlas juntas. */
export interface JugadaUsuario {
  fecha: string;
  juego: "Partidas" | "Blackjack" | "Baccarat" | "Ruleta" | "Cara o sello";
  detalle: string;
  /** Lo que de verdad quedó en juego. */
  apostado: number;
  /** Lo que se le acreditó al resolver. 0 si perdió. */
  cobrado: number;
  /** cobrado − apostado. Negativo = perdió. */
  resultado: number;
  estado: EstadoJugada;
  esFake: boolean;
}

export interface ResumenUsuario {
  usuario: UsuarioAdmin;
  retiradoTotal: number;
  totales: {
    apostado: number;
    cobrado: number;
    neto: number;
    ganadas: number;
    perdidas: number;
    enJuego: number;
    /** El neto contando SOLO lo jugado con plata real. */
    netoReal: number;
  };
  jugadas: JugadaUsuario[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * OJO CON `apostado`: es lo EMPAREJADO, no lo que puso.
 *
 * En el motor de apuestas lo que nadie cubre vuelve al saldo al cerrar, así
 * que contarlo como apostado inflaría las pérdidas de alguien que solo tuvo
 * mala suerte encontrando rival. Lo mismo con el neto: solo suma lo que ya
 * se resolvió.
 *
 * El neto real va aparte del total porque una racha ganadora hecha con saldo
 * fake no es plata que el negocio deba (ver 0036).
 */
export async function getResumenUsuario(
  usuarioId: string
): Promise<ActionResult<ResumenUsuario>> {
  const parsed = z.string().uuid("Usuario inválido.").safeParse(usuarioId);
  if (!parsed.success) return { ok: false, error: "Usuario inválido." };

  const session = await requireAdminId();
  if (!session.ok) return session;

  const admin = createSupabaseAdminClient();
  const id = parsed.data;

  const [perfilRes, apuestasRes, monedaRes, ticketsRes, recargasRes, retirosRes] =
    await Promise.all([
      admin.from("perfiles").select("*").eq("id", id).single(),
      admin.from("apuestas").select("*").eq("usuario_id", id),
      admin.from("cara_sello_jugadas").select("*").eq("usuario_id", id),
      admin.from("ruleta_tickets").select("*").eq("usuario_id", id),
      admin.from("recargas").select("monto_acreditado").eq("usuario_id", id).eq("estado", "aprobada"),
      admin.from("retiros").select("monto").eq("usuario_id", id).eq("estado", "pagado"),
    ]);

  const perfil = perfilRes.data;
  if (!perfil) return { ok: false, error: "Usuario no encontrado." };

  const jugadas: JugadaUsuario[] = [];

  // ---- Motor de apuestas: partidas, blackjack y baccarat ----
  const apuestas = apuestasRes.data ?? [];
  const eventoIds = [...new Set(apuestas.map((a) => a.evento_id))];
  const eventosRes = eventoIds.length
    ? await admin.from("eventos").select("id, nombre, estado, resultado, categoria").in("id", eventoIds)
    : { data: [] };
  const evPorId = new Map((eventosRes.data ?? []).map((e) => [e.id, e]));

  for (const a of apuestas) {
    const e = evPorId.get(a.evento_id);
    const matcheado = Number(a.monto_matcheado);
    const resuelto = e?.estado === "resuelto" && e.resultado !== null;
    const gano = resuelto && e.resultado === a.lado;
    const cobrado = gano ? pagoPorMatcheado(matcheado) : 0;

    const estado: EstadoJugada = !resuelto
      ? a.estado === "cancelada"
        ? "sin cubrir"
        : "en juego"
      : matcheado === 0
        ? "sin cubrir"
        : gano
          ? "ganada"
          : "perdida";

    jugadas.push({
      fecha: a.created_at,
      juego:
        e?.categoria === "blackjack"
          ? "Blackjack"
          : e?.categoria === "baccarat"
            ? "Baccarat"
            : "Partidas",
      detalle: e?.nombre ?? "—",
      apostado: matcheado,
      cobrado,
      resultado: estado === "ganada" || estado === "perdida" ? r2(cobrado - matcheado) : 0,
      estado,
      esFake: a.es_fake,
    });
  }

  // ---- Cara o sello ----
  for (const j of monedaRes.data ?? []) {
    jugadas.push({
      fecha: j.created_at,
      juego: "Cara o sello",
      detalle: `Eligió ${j.eleccion} · salió ${j.resultado}`,
      apostado: Number(j.monto),
      cobrado: Number(j.pago),
      resultado: r2(Number(j.pago) - Number(j.monto)),
      estado: j.gano ? "ganada" : "perdida",
      esFake: false,
    });
  }

  // ---- Ruleta: agrupada por ronda, porque comprar 10 tickets es UNA jugada ----
  const tickets = ticketsRes.data ?? [];
  const rondaIds = [...new Set(tickets.map((t) => t.ronda_id))];
  const rondasRes = rondaIds.length
    ? await admin.from("ruleta_rondas").select("*").in("id", rondaIds)
    : { data: [] };
  const rondaPorId = new Map((rondasRes.data ?? []).map((r) => [r.id, r]));

  const porRonda = new Map<string, { monto: number; tickets: number; fecha: string }>();
  for (const t of tickets) {
    const acc = porRonda.get(t.ronda_id) ?? { monto: 0, tickets: 0, fecha: t.created_at };
    acc.monto += Number(t.monto);
    acc.tickets += 1;
    if (t.created_at < acc.fecha) acc.fecha = t.created_at;
    porRonda.set(t.ronda_id, acc);
  }

  for (const [rondaId, acc] of porRonda) {
    const r = rondaPorId.get(rondaId);
    const cerrada = Boolean(r?.ganador_ticket_id);
    const gano = cerrada && r?.ganador_usuario_id === id;
    const cobrado = gano ? Number(r?.premio_monto ?? 0) : 0;

    jugadas.push({
      fecha: acc.fecha,
      juego: "Ruleta",
      detalle: `Ronda #${String(r?.numero ?? 0).padStart(4, "0")} · ${acc.tickets} tickets`,
      apostado: r2(acc.monto),
      cobrado,
      resultado: cerrada ? r2(cobrado - acc.monto) : 0,
      estado: !cerrada ? "en juego" : gano ? "ganada" : "perdida",
      esFake: false,
    });
  }

  jugadas.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const resueltas = jugadas.filter((j) => j.estado === "ganada" || j.estado === "perdida");
  const totales = {
    apostado: r2(resueltas.reduce((s, j) => s + j.apostado, 0)),
    cobrado: r2(resueltas.reduce((s, j) => s + j.cobrado, 0)),
    neto: r2(resueltas.reduce((s, j) => s + j.resultado, 0)),
    ganadas: resueltas.filter((j) => j.estado === "ganada").length,
    perdidas: resueltas.filter((j) => j.estado === "perdida").length,
    enJuego: jugadas.filter((j) => j.estado === "en juego").length,
    netoReal: r2(resueltas.filter((j) => !j.esFake).reduce((s, j) => s + j.resultado, 0)),
  };

  return {
    ok: true,
    data: {
      usuario: {
        id: perfil.id,
        nickname: perfil.nickname,
        fullName: perfil.full_name,
        phone: perfil.phone,
        puntos: Number(perfil.puntos),
        saldoDisponible: Number(perfil.saldo_disponible),
        saldoRetenido: Number(perfil.saldo_retenido),
        saldoFake: Number(perfil.saldo_fake),
        saldoFakeRetenido: Number(perfil.saldo_fake_retenido),
        baneado: perfil.baneado,
        baneadoMotivo: perfil.baneado_motivo,
        createdAt: perfil.created_at,
        ipRegistro: perfil.ip_registro,
        depositadoTotal: r2(
          (recargasRes.data ?? []).reduce((s, x) => s + Number(x.monto_acreditado), 0)
        ),
      },
      retiradoTotal: r2((retirosRes.data ?? []).reduce((s, x) => s + Number(x.monto), 0)),
      totales,
      jugadas,
    },
  };
}
