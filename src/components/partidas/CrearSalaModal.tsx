"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { CategoriaBadge } from "@/components/partidas/CategoriaBadge";
import { EventoResumen } from "@/actions/betting";
import { BET_MAX, BET_MIN } from "@/types";

/**
 * "Crear sala" = ser el primero en apostar sobre un título que el admin ya
 * publicó hoy. El jugador no inventa el título ni la categoría: elige uno
 * de la lista, su lado y su monto.
 */
export function CrearSalaModal({
  titulos,
  onCrear,
  onClose,
}: {
  titulos: EventoResumen[];
  onCrear: (eventoId: string, lado: "a" | "b", monto: number) => Promise<void>;
  onClose: () => void;
}) {
  const [seleccionado, setSeleccionado] = useState<EventoResumen | null>(null);
  const [lado, setLado] = useState<"a" | "b">("a");
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
    if (!seleccionado) return;
    setError(undefined);

    const montoNumber = Number(monto);
    if (!Number.isFinite(montoNumber) || montoNumber < BET_MIN || montoNumber > BET_MAX) {
      setError(`El monto debe estar entre S/${BET_MIN} y S/${BET_MAX}.`);
      return;
    }

    setEnviando(true);
    try {
      await onCrear(seleccionado.evento.id, lado, montoNumber);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear la sala.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crear sala"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel-stone flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-gold-dark/50 px-5 py-4">
          <h2 className="font-fantasy text-lg font-bold text-gold-light">Crear sala</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 rounded-md text-parchment/60 transition hover:text-parchment"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!seleccionado ? (
            <>
              <p className="mb-3 text-sm text-parchment/60">
                Elige uno de los títulos publicados hoy.
              </p>
              {titulos.length === 0 ? (
                <p className="rounded-md border border-dashed border-gold-dark/60 p-6 text-center text-sm text-parchment/50">
                  No hay títulos disponibles ahora mismo.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {titulos.map((resumen) => (
                    <li key={resumen.evento.id}>
                      <button
                        type="button"
                        onClick={() => setSeleccionado(resumen)}
                        className="flex w-full items-center justify-between gap-3 rounded-md border border-gold-dark/50 px-3 py-3 text-left transition hover:border-gold-light focus-visible:ring-2 focus-visible:ring-gold-light"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-parchment">
                            {resumen.evento.nombre}
                          </span>
                          <span className="mt-0.5 block text-xs text-parchment/50">
                            {resumen.evento.lado_a} vs {resumen.evento.lado_b}
                          </span>
                        </span>
                        <CategoriaBadge categoria={resumen.evento.categoria} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="mb-3 text-xs font-semibold text-gold-light underline"
              >
                ← Elegir otro título
              </button>

              <p className="font-fantasy text-sm font-bold text-parchment">
                {seleccionado.evento.nombre}
              </p>

              <fieldset className="mt-4">
                <legend className="mb-2 text-sm text-parchment/80">Tu lado</legend>
                <div className="flex gap-2">
                  {(["a", "b"] as const).map((opcion) => {
                    const label =
                      opcion === "a" ? seleccionado.evento.lado_a : seleccionado.evento.lado_b;
                    return (
                      <button
                        key={opcion}
                        type="button"
                        aria-pressed={lado === opcion}
                        onClick={() => setLado(opcion)}
                        className={clsx(
                          "min-h-11 flex-1 rounded-md border px-3 py-2 font-fantasy text-sm font-bold uppercase tracking-wide transition focus-visible:ring-2 focus-visible:ring-gold-light",
                          lado === opcion
                            ? opcion === "a"
                              ? "border-win-glow bg-win/20 text-win-glow"
                              : "border-lose-glow bg-lose/20 text-lose-glow"
                            : "border-gold-dark text-parchment/70 hover:border-gold-light"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-4">
                <label htmlFor="sala-monto" className="mb-1.5 block text-sm text-parchment/80">
                  Monto (S/{BET_MIN} – S/{BET_MAX})
                </label>
                <input
                  id="sala-monto"
                  type="number"
                  min={BET_MIN}
                  max={BET_MAX}
                  step="0.01"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="min-h-12 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-gold-light [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <p className="mt-1.5 text-xs text-parchment/50">
                  Otros panaderos podrán cubrir tu monto por partes, desde el
                  lado contrario.
                </p>
              </div>

              {error ? (
                <p role="alert" className="mt-3 text-sm text-lose-glow">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        {seleccionado ? (
          <div className="border-t border-gold-dark/50 px-5 py-4">
            <Button type="button" onClick={handleSubmit} disabled={enviando} className="w-full">
              {enviando ? "Creando sala…" : "Crear sala y apostar"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
