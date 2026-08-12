"use client";

import { FormEvent, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { RetadorBadge } from "@/components/partidas/RetadorBadge";
import { LadoResumen } from "@/actions/betting";

export function LadoPanel({
  lado,
  resumen,
  disabled,
  bloqueadoPorMiLado = false,
  terminada = false,
  onApostar,
}: {
  lado: "a" | "b";
  resumen: LadoResumen;
  disabled: boolean;
  /** Ya apostaste al lado contrario de esta sala. */
  bloqueadoPorMiLado?: boolean;
  terminada?: boolean;
  onApostar: (lado: "a" | "b", monto: number) => Promise<void>;
}) {
  const [monto, setMonto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const tieneRetador = resumen.retador !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const montoNumber = Number(monto);
    if (!Number.isFinite(montoNumber) || montoNumber <= 0) {
      setError("Ingresa un monto válido.");
      return;
    }

    setSubmitting(true);
    try {
      await onApostar(lado, montoNumber);
      setMonto("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar tu apuesta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3 rounded-md border border-gold-dark/40 p-4">
      <p
        className={clsx(
          "font-fantasy text-sm font-bold uppercase tracking-wide",
          lado === "a" ? "text-win-glow" : "text-lose-glow"
        )}
      >
        {resumen.label}
      </p>

      <RetadorBadge retador={resumen.retador} size={56} />

      {tieneRetador ? (
        <p className="text-center text-xs text-parchment/60">
          Pidió S/{resumen.montoObjetivo} ·{" "}
          <span className="font-semibold text-gold-light">
            faltan S/{resumen.montoPendiente}
          </span>
        </p>
      ) : null}

      {terminada ? (
        <p className="mt-auto text-center text-[11px] text-parchment/40">
          Partida terminada
        </p>
      ) : bloqueadoPorMiLado ? (
        <p className="mt-auto text-center text-[11px] text-parchment/40">
          Ya elegiste el otro bando
        </p>
      ) : disabled ? (
        <p className="mt-auto text-center text-[11px] text-parchment/40">Apuestas cerradas</p>
      ) : (
        // Input y botón apilados, no lado a lado: la tarjeta ya está
        // partida en dos columnas, y meterlos en la misma fila dejaba el
        // campo tan angosto que no se leía el monto que escribías.
        <form onSubmit={handleSubmit} className="mt-auto flex w-full flex-col gap-2">
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-fantasy text-sm font-bold text-parchment/40"
            >
              S/
            </span>
            <input
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              placeholder={tieneRetador ? String(resumen.montoPendiente) : "0"}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              aria-label={`Monto a apostar en ${resumen.label}`}
              className="min-h-12 w-full rounded-md border border-gold-dark bg-obsidian/60 py-2 pl-9 pr-3 text-center font-fantasy text-lg font-bold text-parchment outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-gold-light [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <Button
            type="submit"
            variant={lado === "a" ? "win" : "lose"}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "Apostando…" : "Apostar"}
          </Button>
          {error ? (
            <p role="alert" className="text-center text-[11px] text-lose-glow">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
