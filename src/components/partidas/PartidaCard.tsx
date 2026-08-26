"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { CategoriaBadge } from "@/components/partidas/CategoriaBadge";
import { LadoPanel } from "@/components/partidas/LadoPanel";
import { MesaBlackjack } from "@/components/partidas/MesaBlackjack";
import { EventoResumen } from "@/actions/betting";

function useCuentaRegresiva(cierraEn: string) {
  const [restanteMs, setRestanteMs] = useState(() => new Date(cierraEn).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRestanteMs(new Date(cierraEn).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [cierraEn]);

  return restanteMs;
}

// "Abrir sin límite" (0023) empuja cierra_en ~100 años al futuro en vez de
// usar un campo nullable — ver esa migración. Ningún conteo explícito pasa
// de 1440 min (24h, el máximo que acepta `admin_cambiar_estado_evento`),
// así que cualquier resto por encima de una semana es inequívocamente "sin
// límite" y no debe mostrarse como reloj.
const SIN_LIMITE_UMBRAL_MS = 7 * 24 * 60 * 60 * 1000;

function formatoRestante(ms: number): string {
  if (ms <= 0) return "Cerrado";
  if (ms > SIN_LIMITE_UMBRAL_MS) return "Sin límite";
  const totalSeg = Math.floor(ms / 1000);
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

export function PartidaCard({
  resumen,
  miUsuarioId,
  onApostar,
  onMarcarTurno,
}: {
  resumen: EventoResumen;
  miUsuarioId?: string;
  onApostar: (eventoId: string, lado: "a" | "b", monto: number) => Promise<void>;
  /** Solo lo usan las mesas de blackjack (0039). */
  onMarcarTurno?: (eventoId: string, accion: "pedir" | "quedarse") => Promise<void>;
}) {
  const { evento, ladoA, ladoB, miLado } = resumen;
  const restanteMs = useCuentaRegresiva(evento.cierra_en);
  const terminada =
    evento.estado === "resuelto" ||
    evento.estado === "cancelado" ||
    evento.resultado_preliminar !== null;
  const cerrado = terminada || evento.estado !== "abierto" || restanteMs <= 0;

  return (
    <Panel className="flex flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <CategoriaBadge categoria={evento.categoria} />
        <span
          className={
            cerrado
              ? "rounded-md border border-gold-dark/60 px-2 py-1 text-[11px] font-semibold text-parchment/50"
              : "rounded-md border border-gold-dark bg-charcoal px-2 py-1 font-fantasy text-xs font-bold text-gold-light"
          }
        >
          {evento.estado === "cancelado"
            ? "Partida cancelada"
            : terminada
              ? "Partida terminada"
              : formatoRestante(restanteMs)}
        </span>
      </div>

      <p className="mt-3 text-center font-fantasy text-sm font-semibold text-parchment">
        {evento.nombre}
      </p>

      <div className="mt-4 flex items-stretch gap-2">
        <LadoPanel
          lado="a"
          resumen={ladoA}
          resumenContrario={ladoB}
          disabled={cerrado}
          // En una sala se elige un bando: si ya entraste por un lado, el
          // contrario queda bloqueado (crear_apuesta lo rechaza igual).
          bloqueadoPorMiLado={miLado === "b"}
          terminada={terminada}
          miUsuarioId={miUsuarioId}
          onApostar={(lado, monto) => onApostar(evento.id, lado, monto)}
        />
        <LadoPanel
          lado="b"
          resumen={ladoB}
          resumenContrario={ladoA}
          disabled={cerrado}
          bloqueadoPorMiLado={miLado === "a"}
          terminada={terminada}
          miUsuarioId={miUsuarioId}
          onApostar={(lado, monto) => onApostar(evento.id, lado, monto)}
        />
      </div>

      {evento.categoria === "blackjack" && !terminada && onMarcarTurno ? (
        <MesaBlackjack evento={evento} miLado={miLado} onMarcarTurno={onMarcarTurno} />
      ) : null}

      {evento.estado === "cancelado" ? (
        <p className="mt-4 rounded-md border border-lose/50 bg-lose/5 px-3 py-2.5 text-center text-xs text-parchment/60">
          Partida cancelada — tu apuesta se devolvió por completo a tu saldo.
        </p>
      ) : evento.estado === "resuelto" && evento.resultado ? (
        <p className="mt-4 rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2.5 text-center text-xs text-parchment/60">
          Ganó:{" "}
          <span className="font-fantasy font-bold text-gold-light">
            {evento.resultado === "a" ? evento.lado_a : evento.lado_b}
          </span>
        </p>
      ) : evento.resultado_preliminar !== null ? (
        <p className="mt-4 rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2.5 text-center text-xs text-parchment/60">
          Resultado en revisión — el pago se está confirmando.
        </p>
      ) : null}

      <p className="mt-3 text-center text-[11px] text-parchment/40">Multiplicador 1.80x</p>
    </Panel>
  );
}
