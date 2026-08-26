"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { EstadoTurno, Evento } from "@/lib/supabase/types";

const TURNO_LABEL: Record<EstadoTurno, string> = {
  esperando: "En su turno",
  pidiendo: "Pide carta",
  quedado: "Se quedó",
};

const TURNO_COLOR: Record<EstadoTurno, string> = {
  esperando: "border-gold-dark/40 text-parchment/50",
  pidiendo: "border-gold-light/60 bg-gold/10 text-gold-light",
  quedado: "border-win-glow/50 bg-win/10 text-win-glow",
};

/**
 * La franja de turno de una mesa de blackjack. La app NO reparte cartas ni
 * cuenta puntos: esto es solo la señal de "quiero otra" / "me planto" que
 * ve el que reparte (y el rival). Ver 0039_blackjack.sql.
 *
 * Solo el LADO A pide cartas. El lado B apuesta a que gana el host, y la
 * mano del host la juega quien reparte siguiendo la regla de la casa: ahí
 * no hay nada que decidir. `marcar_turno` lo rechaza en SQL además de que
 * acá no se muestren los botones (0040).
 */
export function MesaBlackjack({
  evento,
  miLado,
  onMarcarTurno,
}: {
  evento: Evento;
  miLado: "a" | "b" | null;
  onMarcarTurno: (eventoId: string, accion: "pedir" | "quedarse") => Promise<void>;
}) {
  const [enviando, setEnviando] = useState<"pedir" | "quedarse" | null>(null);
  const soyElJugador = miLado === "a";

  async function marcar(accion: "pedir" | "quedarse") {
    setEnviando(accion);
    try {
      await onMarcarTurno(evento.id, accion);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-gold-dark/50 bg-obsidian/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">Turnos</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <TurnoLado nombre={evento.lado_a} turno={evento.turno_a} cartas={evento.cartas_a} />
        <LadoHost nombre={evento.lado_b} />
      </div>

      {miLado === null ? (
        <p className="mt-3 text-center text-[11px] text-parchment/40">
          Mesa de dos: siéntate en otra si esta ya está llena.
        </p>
      ) : !soyElJugador ? (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-parchment/50">
          Apostaste al host. Su mano la juega quien reparte, así que no hay
          nada que pedir — solo espera el resultado.
        </p>
      ) : evento.turno_a === "quedado" ? (
        <p className="mt-3 text-center text-xs text-win-glow">
          Te quedaste. Espera a que se reparta el resto.
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            disabled={enviando !== null}
            onClick={() => marcar("pedir")}
            className="min-h-9 flex-1 px-3 py-1 text-xs"
          >
            {enviando === "pedir" ? "…" : "Pedir carta"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={enviando !== null}
            onClick={() => marcar("quedarse")}
            className="min-h-9 flex-1 px-3 py-1 text-xs"
          >
            {enviando === "quedarse" ? "…" : "Quedarse"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** El lado del host no tiene turno que mostrar: su mano la reparte el que
 * dirige la mesa, no se pide. */
function LadoHost({ nombre }: { nombre: string }) {
  return (
    <div className="rounded-md border border-gold-dark/40 px-2.5 py-2 text-center">
      <p className="truncate text-[11px] text-parchment/50">{nombre}</p>
      <p className="mt-0.5 text-xs font-semibold text-parchment/50">Host</p>
      <p className="mt-0.5 text-[10px] text-parchment/40">No pide cartas</p>
    </div>
  );
}

function TurnoLado({
  nombre,
  turno,
  cartas,
}: {
  nombre: string;
  turno: EstadoTurno;
  cartas: number;
}) {
  return (
    <div className={clsx("rounded-md border px-2.5 py-2 text-center", TURNO_COLOR[turno])}>
      <p className="truncate text-[11px] text-parchment/50">{nombre}</p>
      <p className="mt-0.5 text-xs font-semibold">{TURNO_LABEL[turno]}</p>
      {cartas > 0 ? (
        <p className="mt-0.5 text-[10px] text-parchment/40">
          {cartas === 1 ? "1 carta pedida" : `${cartas} cartas pedidas`}
        </p>
      ) : null}
    </div>
  );
}
