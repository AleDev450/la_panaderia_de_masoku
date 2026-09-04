"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { getMisJugadas, jugarCaraSello } from "@/actions/caraSello";
import { getConfig } from "@/actions/ruleta";
import { CachudobetConfig, CaraSelloJugada, LadoMoneda } from "@/lib/supabase/types";
import {
  DURACION_MONEDA_MS,
  LADO_MONEDA_LABEL,
  pagoCaraSello,
  rotacionFinalMoneda,
} from "@/lib/caraSello";

/**
 * Cara o sello.
 *
 * EL RESULTADO YA VINO DECIDIDO. `jugar_cara_sello` lo sacó de `random()` en
 * Postgres y ya movió el saldo antes de que esta pantalla anime nada. La
 * moneda gira hacia el ángulo que corresponde a ese resultado: cara queda en
 * un múltiplo de 360 y sello a media vuelta, así que la animación no PUEDE
 * terminar mostrando algo distinto a lo que dice la base.
 */

const soles = (n: number) => n.toFixed(2);

function CaraSelloContent() {
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [config, setConfig] = useState<CachudobetConfig | null>(null);
  const [jugadas, setJugadas] = useState<CaraSelloJugada[] | null>(null);

  const [eleccion, setEleccion] = useState<LadoMoneda>("cara");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [lanzando, setLanzando] = useState(false);

  const [rotacion, setRotacion] = useState(0);
  const [conTransicion, setConTransicion] = useState(true);
  const [resultado, setResultado] = useState<CaraSelloJugada | null>(null);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);

  const cargarJugadas = useCallback(async () => {
    const result = await getMisJugadas();
    if (result.ok) setJugadas(result.data);
  }, []);

  useEffect(() => {
    getConfig().then((r) => {
      if (r.ok) setConfig(r.data);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    cargarJugadas();
  }, [cargarJugadas]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    setReducirMovimiento(mq.matches);
    const escuchar = (e: MediaQueryListEvent) => setReducirMovimiento(e.matches);
    mq.addEventListener("change", escuchar);
    return () => mq.removeEventListener("change", escuchar);
  }, []);

  const valor = Number(monto);
  const pagoSiGana = config && valor > 0 ? pagoCaraSello(valor, config.cara_sello_multiplicador) : 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);

    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Escribe cuánto quieres apostar.");
      return;
    }

    setLanzando(true);
    setResultado(null);
    try {
      const result = await jugarCaraSello({ eleccion, monto: valor });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const jugada = result.data;

      // La moneda arranca desde donde quedó la vez pasada: se busca el
      // próximo múltiplo de 360 y desde ahí se suman las vueltas, así el
      // ángulo final siempre cae en la cara correcta.
      const base = Math.ceil(rotacion / 360) * 360;
      const destino = base + rotacionFinalMoneda(jugada.resultado);

      setConTransicion(!reducirMovimiento);
      setRotacion(destino);

      if (reducirMovimiento) {
        setResultado(jugada);
        await Promise.all([refreshUser(), cargarJugadas()]);
        return;
      }

      await new Promise((resolver) => setTimeout(resolver, DURACION_MONEDA_MS));
      setResultado(jugada);
      showToast(
        jugada.gano
          ? {
              variant: "success",
              title: "¡Ganaste!",
              description: `Salió ${LADO_MONEDA_LABEL[jugada.resultado].toLowerCase()}. Se te acreditaron S/${soles(jugada.pago)}.`,
            }
          : {
              variant: "info",
              title: "Esta vez no",
              description: `Salió ${LADO_MONEDA_LABEL[jugada.resultado].toLowerCase()}.`,
            }
      );
      await Promise.all([refreshUser(), cargarJugadas()]);
    } finally {
      setLanzando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">Cara o sello</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Elige un lado y lanza. Si aciertas cobras{" "}
          <span className="text-gold-light">
            {config ? `${config.cara_sello_multiplicador}x` : "—"}
          </span>{" "}
          lo apostado.
        </p>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel className="flex flex-col items-center justify-center p-8">
            <Moneda rotacion={rotacion} conTransicion={conTransicion} />

            <p
              aria-live="polite"
              className={clsx(
                "mt-7 min-h-8 text-center font-display text-xl font-black uppercase tracking-wide",
                resultado
                  ? resultado.gano
                    ? "text-win-glow"
                    : "text-lose-glow"
                  : "text-parchment/40"
              )}
            >
              {lanzando
                ? "Girando…"
                : resultado
                  ? resultado.gano
                    ? `🎉 ¡Ganaste S/${soles(resultado.pago)}!`
                    : "❌ Perdiste"
                  : "Haz tu apuesta"}
            </p>
            {resultado ? (
              <p className="mt-1 text-xs text-parchment/45">
                Salió {LADO_MONEDA_LABEL[resultado.resultado].toLowerCase()} · apostaste a{" "}
                {LADO_MONEDA_LABEL[resultado.eleccion].toLowerCase()}
              </p>
            ) : null}
          </Panel>

          <div className="space-y-4">
            <Panel className="p-5">
              <form onSubmit={handleSubmit}>
                <p className="font-display text-sm font-bold uppercase tracking-wide text-gold-light">
                  Tu apuesta
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Elige un lado">
                  {(["cara", "sello"] as const).map((lado) => (
                    <button
                      key={lado}
                      type="button"
                      aria-pressed={eleccion === lado}
                      onClick={() => setEleccion(lado)}
                      className={clsx(
                        "min-h-14 rounded-lg border px-3 py-2 font-display text-sm font-extrabold uppercase tracking-wide transition",
                        eleccion === lado
                          ? "border-gold bg-gold/15 text-gold shadow-[0_0_20px_-8px_rgba(245,197,24,0.9)]"
                          : "border-gold-dark bg-obsidian/60 text-parchment/60 hover:border-gold/60"
                      )}
                    >
                      <span aria-hidden className="mr-1">
                        🪙
                      </span>
                      {LADO_MONEDA_LABEL[lado]}
                    </button>
                  ))}
                </div>

                <label
                  htmlFor="monto-moneda"
                  className="mt-4 block text-[11px] uppercase tracking-wide text-parchment/40"
                >
                  Monto
                  {config ? ` (S/${soles(config.cara_sello_min)} – S/${soles(config.cara_sello_max)})` : ""}
                </label>
                <input
                  id="monto-moneda"
                  type="number"
                  inputMode="decimal"
                  min={config?.cara_sello_min ?? 5}
                  max={config?.cara_sello_max ?? 100}
                  step="1"
                  value={monto}
                  onChange={(e) => {
                    setMonto(e.target.value);
                    setError(undefined);
                  }}
                  className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                  placeholder={soles(config?.cara_sello_min ?? 5)}
                />

                {pagoSiGana > 0 ? (
                  <p className="mt-2 text-xs text-parchment/50">
                    Si ganas cobras{" "}
                    <span className="text-gold-light">S/{soles(pagoSiGana)}</span>
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={lanzando || monto.trim() === ""}
                  className="mt-4 w-full"
                >
                  {lanzando ? "Lanzando…" : "Apostar"}
                </Button>

                {error ? <p className="mt-3 text-sm text-lose-glow">{error}</p> : null}
              </form>

              <p className="mt-4 border-t border-gold-dark/40 pt-3 text-xs text-parchment/45">
                Tu saldo: <span className="text-parchment/80">S/{soles(user?.balance ?? 0)}</span>
              </p>
            </Panel>

            <Panel className="p-5">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-gold-light">
                Tus últimas jugadas
              </h2>
              {jugadas === null ? (
                <p className="mt-3 text-sm text-parchment/45">Cargando…</p>
              ) : jugadas.length === 0 ? (
                <p className="mt-3 text-sm text-parchment/45">Todavía no has jugado.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {jugadas.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-parchment/60">
                        {LADO_MONEDA_LABEL[j.resultado]}
                        <span className="ml-1.5 text-xs text-parchment/35">
                          (fuiste {LADO_MONEDA_LABEL[j.eleccion].toLowerCase()})
                        </span>
                      </span>
                      <span
                        className={clsx(
                          "shrink-0 font-display text-sm font-bold",
                          j.gano ? "text-win-glow" : "text-lose-glow"
                        )}
                      >
                        {j.gano ? `+S/${soles(j.pago - j.monto)}` : `−S/${soles(j.monto)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </section>
      </main>
    </>
  );
}

/** La moneda: dos caras enfrentadas girando sobre el eje Y. La rotación la
 * manda el padre — acá no se decide nada. */
function Moneda({ rotacion, conTransicion }: { rotacion: number; conTransicion: boolean }) {
  return (
    <div className="[perspective:900px]">
      <div
        className="relative h-40 w-40 sm:h-48 sm:w-48"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateY(${rotacion}deg)`,
          transition: conTransicion
            ? `transform ${DURACION_MONEDA_MS}ms cubic-bezier(0.4, 0, 0.15, 1)`
            : undefined,
        }}
      >
        <CaraMoneda etiqueta="Cara" simbolo="C" />
        <CaraMoneda etiqueta="Sello" simbolo="S" reverso />
      </div>
    </div>
  );
}

function CaraMoneda({
  etiqueta,
  simbolo,
  reverso = false,
}: {
  etiqueta: string;
  simbolo: string;
  reverso?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-full border-4"
      style={{
        backfaceVisibility: "hidden",
        transform: reverso ? "rotateY(180deg)" : undefined,
        borderColor: reverso ? "#cfd3dc" : "#f5c518",
        background: reverso
          ? "radial-gradient(circle at 35% 30%, #6b7280, #1f2937 70%)"
          : "radial-gradient(circle at 35% 30%, #ffd95c, #b8860b 72%)",
        boxShadow: "0 18px 40px -18px rgba(0,0,0,0.9), inset 0 2px 12px rgba(255,255,255,0.25)",
      }}
    >
      <span
        className="font-display text-5xl font-black"
        style={{ color: reverso ? "#e5e7eb" : "#3b2c05" }}
      >
        {simbolo}
      </span>
      <span
        className="mt-1 font-display text-[11px] font-bold uppercase tracking-[0.2em]"
        style={{ color: reverso ? "#cbd5e1" : "#4a3806" }}
      >
        {etiqueta}
      </span>
    </div>
  );
}

export default function CaraSelloPage() {
  return (
    <RequirePlayer>
      <CaraSelloContent />
    </RequirePlayer>
  );
}
