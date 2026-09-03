"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { LadoPanel } from "@/components/partidas/LadoPanel";
import { LadoResumen } from "@/actions/betting";
import { EstadoTurno, Evento } from "@/lib/supabase/types";
import { CUOTA } from "@/lib/apuestas";

/**
 * Mesa de blackjack, dibujada como una mesa de casino: un tapete redondo
 * con dos asientos enfrentados, JUGADOR arriba y BANCA abajo.
 *
 * Antes eran los dos `LadoPanel` genéricos, uno al lado del otro, igual que
 * en un título de deportes. Pero acá no son "dos lados de una apuesta":
 * son dos sillas de una mesa 1v1, y quién se sienta en cuál cambia lo que
 * puedes hacer. El círculo lo dice sin explicarlo.
 *
 * REGLA QUE SE VE EN EL LAYOUT: solo el JUGADOR (lado A) pide cartas. La
 * BANCA (lado B) no tiene turno — su mano la juega quien reparte siguiendo
 * la regla de la casa (ver 0040_blackjack_solo_jugador_pide.sql).
 *
 * `LadoPanel` se reutiliza tal cual dentro del asiento libre: toda la
 * lógica de apostar (montos, confirmación, errores) sigue viviendo ahí.
 */

const TURNO_LABEL: Record<EstadoTurno, string> = {
  esperando: "En su turno",
  pidiendo: "Pide carta",
  quedado: "Se plantó",
};

export function MesaBlackjack({
  evento,
  ladoA,
  ladoB,
  miLado,
  disabled,
  terminada,
  miUsuarioId,
  onApostar,
  onMarcarTurno,
}: {
  evento: Evento;
  ladoA: LadoResumen;
  ladoB: LadoResumen;
  miLado: "a" | "b" | null;
  disabled: boolean;
  terminada: boolean;
  miUsuarioId?: string;
  onApostar: (lado: "a" | "b", monto: number) => Promise<void>;
  onMarcarTurno?: (eventoId: string, accion: "pedir" | "quedarse") => Promise<void>;
}) {
  const [enviando, setEnviando] = useState<"pedir" | "quedarse" | null>(null);

  const jugador = ladoA.participantes[0] ?? null;
  const banca = ladoB.participantes[0] ?? null;
  const soyElJugador = miLado === "a";

  async function marcar(accion: "pedir" | "quedarse") {
    if (!onMarcarTurno) return;
    setEnviando(accion);
    try {
      await onMarcarTurno(evento.id, accion);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="mt-4">
      {/* Tapete. El degradado radial es lo que lo lee como mesa y no como
          otra card más. */}
      <div className="relative overflow-hidden rounded-[2rem] border border-gold-dark bg-[radial-gradient(ellipse_at_center,rgba(245,197,24,0.09),transparent_70%)] px-4 py-5 sm:px-6">
        {/* ---------------------------------------------------- JUGADOR */}
        <Asiento
          rotulo="Jugador"
          nombre={evento.lado_a}
          ocupante={jugador}
          esMio={soyElJugador}
          acento="#f5c518"
          turno={evento.turno_a}
          cartas={evento.cartas_a}
        >
          {!jugador && !terminada ? (
            <LadoPanel
              lado="a"
              resumen={ladoA}
              resumenContrario={ladoB}
              disabled={disabled}
              bloqueadoPorMiLado={miLado === "b"}
              terminada={terminada}
              miUsuarioId={miUsuarioId}
              onApostar={onApostar}
            />
          ) : null}
        </Asiento>

        {/* ------------------------------------------------ centro mesa */}
        <div className="relative my-4 flex items-center justify-center">
          <span
            aria-hidden
            className="absolute h-px w-full bg-gradient-to-r from-transparent via-gold-dark to-transparent"
          />
          <span className="relative flex h-20 w-20 flex-col items-center justify-center rounded-full border border-gold/40 bg-obsidian/80 shadow-[0_0_28px_-6px_rgba(245,197,24,0.5)]">
            <span className="font-display text-lg font-extrabold text-gold">{CUOTA}x</span>
            <span className="text-[9px] uppercase tracking-wider text-parchment/40">1 vs 1</span>
          </span>
        </div>

        {/* ------------------------------------------------------ BANCA */}
        <Asiento
          rotulo="Banca"
          nombre={evento.lado_b}
          ocupante={banca}
          esMio={miLado === "b"}
          acento="#cfd3dc"
        >
          {!banca && !terminada ? (
            <LadoPanel
              lado="b"
              resumen={ladoB}
              resumenContrario={ladoA}
              disabled={disabled}
              bloqueadoPorMiLado={miLado === "a"}
              terminada={terminada}
              miUsuarioId={miUsuarioId}
              onApostar={onApostar}
            />
          ) : null}
        </Asiento>
      </div>

      {/* --------------------------------------------------- tus acciones */}
      {!terminada && miLado !== null && onMarcarTurno ? (
        soyElJugador ? (
          evento.turno_a === "quedado" ? (
            <p className="mt-3 text-center text-xs font-semibold text-win-glow">
              Te plantaste. Espera a que se reparta el resto.
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={enviando !== null}
                onClick={() => marcar("pedir")}
                className="min-h-11 flex-1 text-xs"
              >
                {enviando === "pedir" ? "…" : "Pedir carta"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={enviando !== null}
                onClick={() => marcar("quedarse")}
                className="min-h-11 flex-1 text-xs"
              >
                {enviando === "quedarse" ? "…" : "Quedarse"}
              </Button>
            </div>
          )
        ) : (
          <p className="mt-3 text-center text-[11px] leading-relaxed text-parchment/45">
            Apostaste a la banca. Su mano la juega quien reparte, así que no
            hay nada que pedir — solo espera el resultado.
          </p>
        )
      ) : null}
    </div>
  );
}

/** Una silla de la mesa: rótulo, quién está sentado y, si está libre, el
 * control para sentarse. */
function Asiento({
  rotulo,
  nombre,
  ocupante,
  esMio,
  acento,
  turno,
  cartas,
  children,
}: {
  rotulo: string;
  nombre: string;
  ocupante: { nickname: string; monto: number } | null;
  esMio: boolean;
  acento: string;
  turno?: EstadoTurno;
  cartas?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border px-4 py-3.5 transition",
        ocupante ? "bg-charcoal/70" : "border-dashed bg-charcoal/30"
      )}
      style={{ borderColor: ocupante ? `${acento}66` : undefined }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p
            className="font-display text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: acento }}
          >
            {rotulo}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-parchment/80">{nombre}</p>
        </div>

        {ocupante ? (
          <div className="text-right">
            <p className="truncate font-display text-sm font-bold text-parchment">
              {ocupante.nickname}
              {esMio ? <span className="ml-1.5 text-xs text-gold">(tú)</span> : null}
            </p>
            <p className="text-xs text-parchment/45">S/{ocupante.monto}</p>
          </div>
        ) : (
          <span className="rounded-full border border-gold-dark px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-parchment/40">
            Silla libre
          </span>
        )}
      </div>

      {/* Señal de turno: solo el jugador la tiene. */}
      {turno ? (
        <div className="mt-2.5 flex items-center gap-2">
          <span
            className={clsx(
              "rounded-md border px-2 py-1 text-[11px] font-bold",
              turno === "pidiendo"
                ? "border-gold bg-gold/15 text-gold"
                : turno === "quedado"
                  ? "border-win-glow/50 bg-win/10 text-win-glow"
                  : "border-gold-dark text-parchment/45"
            )}
          >
            {TURNO_LABEL[turno]}
          </span>
          {cartas && cartas > 0 ? (
            <span className="text-[11px] text-parchment/40">
              {cartas === 1 ? "1 carta pedida" : `${cartas} cartas pedidas`}
            </span>
          ) : null}
        </div>
      ) : null}

      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
