import { EstadoRondaRuleta } from "@/lib/supabase/types";

/**
 * Lógica pura de la ruleta (0048). Sin I/O y sin React: acá vive todo lo que
 * hay que poder probar sin base de datos — cuántos tickets da un monto, cómo
 * se reparte el pozo, dónde queda cada participante en la rueda y en qué
 * ángulo está la animación en un instante dado.
 *
 * NADA DE ESTO DECIDE NADA. El ganador ya viene elegido y pagado desde
 * Postgres (`admin_girar_ruleta`); estas funciones solo dibujan el camino
 * hasta él. El espejo en TS del reparto 80/20 existe para MOSTRAR el premio
 * antes de girar, no para calcular lo que se paga.
 */

/** Cuánto dura el giro en sí, sin contar la cuenta regresiva. */
export const DURACION_GIRO_MS = 9000;

/**
 * La cuenta regresiva que `admin_girar_ruleta` deja fijada en
 * `giro_inicia_en = now() + 3s`. Además de ser parte del show, es el colchón
 * que absorbe la latencia del polling: con poll de 2s, casi todos los
 * clientes ya tienen el dato antes de que el giro arranque de verdad.
 */
export const CUENTA_REGRESIVA_MS = 3000;

/** Vueltas completas antes de frenar. Fijo a propósito: si fuera aleatorio,
 * cada navegador giraría distinto y dejarían de verse lo mismo. */
export const VUELTAS = 6;

export const ESTADO_RONDA_LABEL: Record<EstadoRondaRuleta, string> = {
  borrador: "En preparación",
  abierta: "Ronda abierta",
  cerrada: "Cerrada — por girar",
  girando: "¡Girando!",
  finalizada: "Finalizada",
};

/**
 * Paleta de los segmentos. Empieza por el amarillo de marca y sigue con
 * colores que se distinguen entre sí sobre fondo negro; se repite en ciclo si
 * hay más participantes que colores.
 */
export const COLORES_RULETA = [
  "#f5c518",
  "#ff9f1c",
  "#e05263",
  "#8ac4ff",
  "#4ade80",
  "#c084fc",
  "#f472b6",
  "#22d3ee",
  "#a3e635",
  "#fb923c",
] as const;

export function colorDeIndice(indice: number): string {
  return COLORES_RULETA[indice % COLORES_RULETA.length];
}

/**
 * Cuántos tickets da un monto. `null` cuando no es múltiplo exacto del precio
 * —redondear para abajo y quedarse con el vuelto sería quedarse con plata
 * ajena sin avisar, así que la UI rebota igual que `comprar_tickets_ruleta`.
 */
export function ticketsPorMonto(monto: number, precioTicket: number): number | null {
  if (!Number.isFinite(monto) || monto <= 0 || precioTicket <= 0) return null;
  // En céntimos: 0.1 + 0.2 !== 0.3 también arruina un módulo.
  const centimos = Math.round(monto * 100);
  const precioCentimos = Math.round(precioTicket * 100);
  if (centimos % precioCentimos !== 0) return null;
  return centimos / precioCentimos;
}

/** Los atajos de compra: 1, 2, 3, 5 y 10 tickets. Con precio 3 son los
 * S/3–6–9–15–30 del enunciado, y siguen siendo múltiplos si el precio cambia. */
export function montosRapidos(precioTicket: number): number[] {
  return [1, 2, 3, 5, 10].map((n) => Math.round(n * precioTicket * 100) / 100);
}

/** Espejo del reparto que hace `admin_girar_ruleta`: la comisión es el RESTO,
 * no un segundo redondeo, así las dos partes siempre suman el pozo. */
export function repartoDelPozo(
  pozo: number,
  porcentajePremio: number
): { premio: number; comision: number } {
  const premio = Math.round(((pozo * porcentajePremio) / 100) * 100) / 100;
  return { premio, comision: Math.round((pozo - premio) * 100) / 100 };
}

export function porcentajeDeParticipacion(tickets: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((tickets / total) * 1000) / 10;
}

export interface ParticipanteRonda {
  usuarioId: string;
  nickname: string;
  tickets: number;
  porcentaje: number;
  color: string;
}

export interface SegmentoRueda extends ParticipanteRonda {
  /** Grados desde arriba, en sentido horario. */
  desde: number;
  hasta: number;
}

/**
 * Reparte la rueda proporcionalmente a los tickets: 10 tickets ocupan diez
 * veces el arco de 1. Los tramos se calculan acumulando el ángulo de corte en
 * vez de sumar anchos, para que el último cierre exactamente en 360 y no
 * quede una rendija por redondeo.
 */
export function segmentosDeRueda(participantes: ParticipanteRonda[]): SegmentoRueda[] {
  const total = participantes.reduce((n, p) => n + p.tickets, 0);
  if (total <= 0) return [];

  let acumulado = 0;
  return participantes.map((p) => {
    const desde = (acumulado / total) * 360;
    acumulado += p.tickets;
    return { ...p, desde, hasta: (acumulado / total) * 360 };
  });
}

/** El centro del arco de un participante: hacia ahí apunta la flecha al frenar. */
export function centroDelSegmento(segmento: SegmentoRueda): number {
  return (segmento.desde + segmento.hasta) / 2;
}

/**
 * Cuánto tiene que rotar la rueda para que el ganador quede bajo la flecha
 * (arriba, 0°). La rueda gira en sentido horario, así que se resta el ángulo
 * del ganador y se le suman las vueltas de show.
 */
export function rotacionFinal(anguloGanador: number): number {
  return VUELTAS * 360 + (360 - (anguloGanador % 360));
}

/**
 * Aceleración del giro. Smootherstep (6t⁵−15t⁴+10t³): arranca lento, agarra
 * velocidad, la mantiene un buen rato en el medio y frena suave al final —
 * que es exactamente el arco que se le pide a la animación.
 */
export function curvaDeGiro(progreso: number): number {
  const t = Math.min(1, Math.max(0, progreso));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export type FaseGiro =
  | { fase: "cuenta"; segundos: number; rotacion: number }
  | { fase: "girando"; rotacion: number }
  | { fase: "terminado"; rotacion: number };

/**
 * EL CORAZÓN DE LA SINCRONIZACIÓN. La animación es una función del tiempo
 * transcurrido desde `giro_inicia_en` —una marca del reloj del SERVIDOR—, no
 * de cuándo este navegador se enteró.
 *
 * Por eso dos pantallas que reciben la noticia con dos segundos de diferencia
 * igual frenan en el ganador en el mismo instante absoluto: la que llegó
 * tarde no arranca la animación desde cero, se engancha donde ya iba.
 *
 * @param msDesdeInicio  ahora(servidor) − giro_inicia_en. Negativo = todavía
 *                       está corriendo la cuenta regresiva.
 */
export function faseDeGiro(msDesdeInicio: number, anguloGanador: number): FaseGiro {
  const destino = rotacionFinal(anguloGanador);

  if (msDesdeInicio < 0) {
    return {
      fase: "cuenta",
      segundos: Math.min(
        Math.ceil(CUENTA_REGRESIVA_MS / 1000),
        Math.max(1, Math.ceil(-msDesdeInicio / 1000))
      ),
      rotacion: 0,
    };
  }

  if (msDesdeInicio >= DURACION_GIRO_MS) {
    return { fase: "terminado", rotacion: destino };
  }

  return {
    fase: "girando",
    rotacion: destino * curvaDeGiro(msDesdeInicio / DURACION_GIRO_MS),
  };
}
