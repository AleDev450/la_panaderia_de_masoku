"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BET_MAX, BET_MIN } from "@/types";

/**
 * Sentarse en una mesa de blackjack. A diferencia de `CrearSalaModal`, acá
 * no se elige título ni lado: el motor sienta donde haya sitio y abre mesa
 * nueva si están todas llenas (ver `unirse_blackjack` en 0039).
 */
export function BlackjackModal({
  onSentarse,
  onClose,
}: {
  onSentarse: (monto: number) => Promise<void>;
  onClose: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    setError(undefined);

    const montoNumber = Number(monto);
    if (!Number.isFinite(montoNumber) || montoNumber < BET_MIN || montoNumber > BET_MAX) {
      setError(`El monto debe estar entre S/${BET_MIN} y S/${BET_MAX}.`);
      return;
    }

    setEnviando(true);
    try {
      await onSentarse(montoNumber);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos sentarte en la mesa.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sentarse en una mesa de blackjack"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel-stone w-full max-w-md rounded-t-xl p-5 sm:rounded-xl">
        <h2 className="font-fantasy text-lg font-bold text-gold-light">Blackjack</h2>
        <p className="mt-2 text-sm text-parchment/70">
          Te sentamos en una mesa con sitio libre; si están todas llenas se
          abre una nueva. Son de dos personas y no tienen reloj: la mano
          empieza cuando llega el otro.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-parchment/50">
          El asiento decide qué te toca: si la mesa está vacía juegas la mano
          y pides tus cartas; si ya hay alguien sentado, apuestas al host —
          su mano la juega quien reparte y tú solo esperas el resultado.
        </p>

        <label htmlFor="monto-blackjack" className="mt-4 mb-1.5 block text-sm text-parchment/80">
          Cuánto pones (S/{BET_MIN} – S/{BET_MAX})
        </label>
        <input
          id="monto-blackjack"
          type="number"
          min={BET_MIN}
          max={BET_MAX}
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-parchment/40">
          No tiene que coincidir con lo que ponga el otro: se juega por lo
          menor de los dos y la diferencia te vuelve al saldo al cerrar la
          mano.
        </p>

        {error ? <p className="mt-3 text-sm text-lose-glow">{error}</p> : null}

        <div className="mt-5 flex gap-2">
          <Button type="button" disabled={enviando || monto === ""} onClick={handleSubmit} className="flex-1">
            {enviando ? "Sentándote…" : "Sentarme"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
