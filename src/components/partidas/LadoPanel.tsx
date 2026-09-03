"use client";

import { FormEvent, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { RetadorBadge } from "@/components/partidas/RetadorBadge";
import { LadoResumen } from "@/actions/betting";
import { BET_MAX, BET_MIN } from "@/types";

export function LadoPanel({
  lado,
  resumen,
  /** Mínimo por apuesta en ESTA sala. Blackjack usa uno más bajo que el
   * resto de categorías (ver 0045_minimo_blackjack.sql). */
  montoMin = BET_MIN,
  /** Resumen del lado contrario: lo que tu apuesta cubriría al entrar. */
  resumenContrario,
  disabled,
  bloqueadoPorMiLado = false,
  terminada = false,
  miUsuarioId,
  onApostar,
}: {
  lado: "a" | "b";
  resumen: LadoResumen;
  montoMin?: number;
  resumenContrario: LadoResumen;
  disabled: boolean;
  /** Ya apostaste al lado contrario de esta sala. */
  bloqueadoPorMiLado?: boolean;
  terminada?: boolean;
  miUsuarioId?: string;
  onApostar: (lado: "a" | "b", monto: number) => Promise<void>;
}) {
  const [monto, setMonto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Monto a la espera de confirmación: se llena cuando este lado ya tiene
  // dinero sin cubrir y el jugador está por sumarle más (ver handleSubmit).
  const [confirmando, setConfirmando] = useState<number | null>(null);

  const { participantes } = resumen;
  // Lo que emparejarías al instante si apuestas de este lado es lo que le
  // falta cubrir al lado CONTRARIO, no a este.
  const cubrible = resumenContrario.totalPendiente;

  async function ejecutarApuesta(montoNumber: number) {
    setSubmitting(true);
    try {
      await onApostar(lado, montoNumber);
      setMonto("");
      setConfirmando(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar tu apuesta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const montoNumber = Number(monto);
    if (!Number.isFinite(montoNumber)) {
      setError("Ingresa un monto válido.");
      return;
    }
    // Se avisa acá y no recién en el servidor: el mínimo cambia por
    // categoría y un rebote de Postgres no explica cuál era.
    if (montoNumber < montoMin || montoNumber > BET_MAX) {
      setError(`El monto debe estar entre S/${montoMin} y S/${BET_MAX}.`);
      return;
    }

    // Este lado ya tiene apuestas sin rival — lo más probable es que la
    // tuya tampoco encuentre uno. Se avisa antes de mandarla en vez de
    // dejar que se entere recién cuando cierre la sala y se la devuelvan.
    if (resumen.totalPendiente > 0) {
      setConfirmando(montoNumber);
      return;
    }

    await ejecutarApuesta(montoNumber);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3 rounded-md border border-gold-dark/40 p-4">
      <p
        className={clsx(
          "font-display text-sm font-bold uppercase tracking-wide",
          lado === "a" ? "text-win-glow" : "text-lose-glow"
        )}
      >
        {resumen.label}
      </p>

      {participantes.length === 0 ? (
        <RetadorBadge retador={null} size={56} />
      ) : (
        <>
          <ul className="flex w-full flex-col gap-2">
            {participantes.map((p) => (
              <li
                key={p.usuarioId}
                className={clsx(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5",
                  p.usuarioId === miUsuarioId
                    ? "border-gold-light/60 bg-gold/10"
                    : "border-gold-dark/30"
                )}
              >
                <RetadorBadge retador={p} size={32} soloEscudo />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-parchment/85">
                  {p.nickname}
                  {p.usuarioId === miUsuarioId ? (
                    <span className="ml-1 text-[10px] font-normal text-gold/70">(tú)</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-display text-xs font-bold text-gold-light">
                  S/{p.monto}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-center text-xs text-parchment/60">
            {participantes.length}{" "}
            {participantes.length === 1 ? "apostador" : "apostadores"} · S/
            {resumen.totalApostado} en juego
            {resumen.totalPendiente > 0 ? (
              <>
                {" · "}
                <span className="font-semibold text-gold-light">
                  S/{resumen.totalPendiente} sin cubrir
                </span>
              </>
            ) : null}
          </p>
        </>
      )}

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
      ) : confirmando !== null ? (
        <div className="mt-auto flex w-full flex-col gap-2 rounded-md border border-gold-light/50 bg-gold/10 p-3">
          <p className="text-center text-[11px] text-parchment/80">
            Este lado ya tiene{" "}
            <span className="font-semibold text-gold-light">
              S/{resumen.totalPendiente} sin cubrir
            </span>
            . Tu apuesta puede quedar pendiente y se te devuelve si nadie la
            cubre antes de que cierre la sala.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={lado === "a" ? "win" : "lose"}
              disabled={submitting}
              onClick={() => ejecutarApuesta(confirmando)}
              className="flex-1"
            >
              {submitting ? "Apostando…" : "Apostar igual"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => setConfirmando(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        // Input y botón apilados, no lado a lado: la tarjeta ya está
        // partida en dos columnas, y meterlos en la misma fila dejaba el
        // campo tan angosto que no se leía el monto que escribías.
        <form onSubmit={handleSubmit} className="mt-auto flex w-full flex-col gap-2">
          {cubrible > 0 ? (
            <p className="text-center text-[11px] text-parchment/50">
              Hasta S/{cubrible} se empareja al instante
            </p>
          ) : null}
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-display text-sm font-bold text-parchment/40"
            >
              S/
            </span>
            <input
              type="number"
              min={montoMin}
              step="0.01"
              inputMode="decimal"
              placeholder={cubrible > 0 ? String(cubrible) : "0"}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              aria-label={`Monto a apostar en ${resumen.label}`}
              className="min-h-12 w-full rounded-md border border-gold-dark bg-obsidian/60 py-2 pl-9 pr-3 text-center font-display text-lg font-bold text-parchment outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-gold-light [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
