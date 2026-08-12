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
  onApostar,
}: {
  lado: "a" | "b";
  resumen: LadoResumen;
  disabled: boolean;
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
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3 rounded-md border border-gold-dark/40 p-3">
      <p
        className={clsx(
          "font-fantasy text-xs font-bold uppercase tracking-wide",
          lado === "a" ? "text-win-glow" : "text-lose-glow"
        )}
      >
        {resumen.label}
      </p>

      <RetadorBadge retador={resumen.retador} />

      {tieneRetador ? (
        <p className="text-center text-[11px] text-parchment/50">
          Pidió S/{resumen.montoObjetivo} · faltan S/{resumen.montoPendiente}
        </p>
      ) : null}

      {disabled ? (
        <p className="text-center text-[11px] text-parchment/40">Título cerrado</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              placeholder={tieneRetador ? `hasta S/${resumen.montoPendiente}` : "S/"}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              aria-label={`Monto a apostar en ${resumen.label}`}
              className="min-h-9 w-0 flex-1 rounded-md border border-gold-dark bg-obsidian/60 px-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
            <Button
              type="submit"
              variant={lado === "a" ? "win" : "lose"}
              disabled={submitting}
              className="min-h-9 px-3 py-0 text-xs"
            >
              {submitting ? "…" : "Apostar"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-[11px] text-lose-glow">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
