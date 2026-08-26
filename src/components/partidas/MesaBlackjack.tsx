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
  const miTurno = miLado === "a" ? evento.turno_a : miLado === "b" ? evento.turno_b : null;

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
        <TurnoLado nombre={evento.lado_b} turno={evento.turno_b} cartas={evento.cartas_b} />
      </div>

      {miLado !== null ? (
        miTurno === "quedado" ? (
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
        )
      ) : (
        <p className="mt-3 text-center text-[11px] text-parchment/40">
          Mesa de dos: siéntate en otra si esta ya está llena.
        </p>
      )}
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
