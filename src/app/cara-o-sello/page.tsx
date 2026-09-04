"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import {
  VistaCaraSello,
  cancelarSalaCaraSello,
  crearSalaCaraSello,
  getLobbyCaraSello,
  unirseCaraSello,
} from "@/actions/caraSello";
import { CaraSelloSala, LadoMoneda } from "@/lib/supabase/types";
import {
  DURACION_MONEDA_MS,
  LADO_MONEDA_LABEL,
  ladoDe,
  pagoCaraSello,
  rotacionFinalMoneda,
} from "@/lib/caraSello";

/**
 * Cara o sello 1v1.
 *
 * Uno abre la sala eligiendo lado y monto; otro se sienta enfrente con el
 * mismo monto y ahí cae la moneda. El resultado lo decide Postgres dentro de
 * `unirse_cara_sello`, en la misma transacción que mueve el saldo de los dos:
 * esta pantalla solo lo anima.
 *
 * Los dos jugadores se enteran por caminos distintos —el que se sienta lo
 * recibe como respuesta de su propia acción, el que abrió lo ve en el
 * siguiente poll— pero los dos ven exactamente el mismo resultado, porque ya
 * está escrito en la base antes de que gire nada.
 */

const soles = (n: number) => n.toFixed(2);

function CaraSelloContent() {
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [vista, setVista] = useState<VistaCaraSello | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [rotacion, setRotacion] = useState(0);
  const [conTransicion, setConTransicion] = useState(true);
  const [duelo, setDuelo] = useState<CaraSelloSala | null>(null);
  const [animando, setAnimando] = useState(false);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);

  /** Duelos que ya se mostraron. Sin esto, el poll volvería a animar el mismo
   * resultado cada dos segundos. */
  const animados = useRef<Set<string>>(new Set());
  const primeraCarga = useRef(true);

  const lanzarMoneda = useCallback(
    async (sala: CaraSelloSala) => {
      if (!sala.resultado) return;
      animados.current.add(sala.id);

      const base = Math.ceil(rotacion / 360) * 360;
      setConTransicion(!reducirMovimiento);
      setRotacion(base + rotacionFinalMoneda(sala.resultado));

      if (!reducirMovimiento) {
        setAnimando(true);
        await new Promise((resolver) => setTimeout(resolver, DURACION_MONEDA_MS));
        setAnimando(false);
      }
      setDuelo(sala);
    },
    [rotacion, reducirMovimiento]
  );

  const refresh = useCallback(async () => {
    const result = await getLobbyCaraSello();
    if (!result.ok) {
      setErrorCarga(result.error);
      return;
    }
    setErrorCarga(null);
    setVista(result.data);

    // En la primera carga los duelos viejos se marcan como vistos: entrar a
    // la página no debería reproducir la partida de ayer.
    if (primeraCarga.current) {
      primeraCarga.current = false;
      for (const d of result.data.misDuelos) animados.current.add(d.sala.id);
      return;
    }

    // El que abrió la sala se entera acá: su duelo aparece resuelto.
    const reciente = result.data.misDuelos[0];
    if (reciente && !animados.current.has(reciente.sala.id)) {
      await lanzarMoneda(reciente.sala);
      await refreshUser();
    }
  }, [lanzarMoneda, refreshUser]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    const id = setInterval(refresh, 3_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    setReducirMovimiento(mq.matches);
    const escuchar = (e: MediaQueryListEvent) => setReducirMovimiento(e.matches);
    mq.addEventListener("change", escuchar);
    return () => mq.removeEventListener("change", escuchar);
  }, []);

  async function sentarse(salaId: string) {
    const result = await unirseCaraSello(salaId);
    if (!result.ok) {
      showToast({ variant: "warning", title: "No se pudo entrar", description: result.error });
      await refresh();
      return;
    }
    await lanzarMoneda(result.data);
    await Promise.all([refresh(), refreshUser()]);
  }

  async function cancelar(salaId: string) {
    const result = await cancelarSalaCaraSello(salaId);
    if (!result.ok) {
      showToast({ variant: "warning", title: "No se pudo cancelar", description: result.error });
      return;
    }
    showToast({ variant: "info", title: "Sala cancelada", description: "Te devolvimos tu monto." });
    await Promise.all([refresh(), refreshUser()]);
  }

  const gane = duelo && user ? duelo.ganador_id === user.id : false;
  const miLadoDelDuelo = duelo && user ? ladoDe(duelo, user.id) : null;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">Cara o sello</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Uno contra uno. Abre una sala con tu lado y tu monto, o siéntate en la de otro:
          quien acierta se lleva{" "}
          <span className="text-gold-light">
            {vista ? `${vista.config.cara_sello_multiplicador}x` : "—"}
          </span>
          .
        </p>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel className="flex flex-col items-center justify-center p-8">
            <Moneda rotacion={rotacion} conTransicion={conTransicion} />

            <p
              aria-live="polite"
              className={clsx(
                "mt-7 min-h-8 text-center font-display text-xl font-black uppercase tracking-wide",
                duelo && !animando
                  ? gane
                    ? "text-win-glow"
                    : "text-lose-glow"
                  : "text-parchment/40"
              )}
            >
              {animando
                ? "Girando…"
                : duelo
                  ? gane
                    ? `🎉 ¡Ganaste S/${soles(duelo.premio ?? 0)}!`
                    : "❌ Perdiste"
                  : "Siéntate en una sala"}
            </p>

            {duelo && !animando ? (
              <p className="mt-1 text-center text-xs text-parchment/45">
                Salió {LADO_MONEDA_LABEL[duelo.resultado!].toLowerCase()}
                {miLadoDelDuelo
                  ? ` · ibas a ${LADO_MONEDA_LABEL[miLadoDelDuelo].toLowerCase()}`
                  : null}{" "}
                · S/{soles(duelo.monto)} cada uno
              </p>
            ) : null}
          </Panel>

          <div className="space-y-4">
            {vista?.miSala ? (
              <MiSala sala={vista.miSala} onCancelar={() => cancelar(vista.miSala!.id)} />
            ) : (
              <FormularioSala
                config={vista?.config ?? null}
                saldo={user?.balance ?? 0}
                onCreada={async () => {
                  await Promise.all([refresh(), refreshUser()]);
                }}
                showToast={showToast}
              />
            )}

            <p className="text-xs text-parchment/45">
              Tu saldo: <span className="text-parchment/80">S/{soles(user?.balance ?? 0)}</span>
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Salas esperando rival
          </h2>

          {vista === null ? (
            errorCarga ? (
              <Panel className="border-dashed p-6 text-center">
                <p className="text-sm text-lose-glow">No se pudo cargar el lobby.</p>
                <p className="mt-1 text-xs text-parchment/45">{errorCarga}</p>
              </Panel>
            ) : (
              <p className="text-sm text-parchment/50">Cargando…</p>
            )
          ) : vista.abiertas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Nadie tiene una sala abierta. Abre la tuya y espera rival.
            </Panel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vista.abiertas.map(({ sala, creadorNickname }) => {
                const miLado = sala.lado_creador === "cara" ? "sello" : "cara";
                const sinSaldo = (user?.balance ?? 0) < sala.monto;
                return (
                  <Panel key={sala.id} className="flex flex-col justify-between p-5">
                    <div>
                      <p className="truncate font-display text-sm font-bold text-parchment">
                        {creadorNickname}
                      </p>
                      <p className="mt-0.5 text-xs text-parchment/45">
                        Eligió {LADO_MONEDA_LABEL[sala.lado_creador].toLowerCase()}
                      </p>
                      <p className="mt-3 font-display text-2xl font-bold text-gold-light">
                        S/{soles(sala.monto)}
                      </p>
                      <p className="text-[11px] text-parchment/40">
                        Ganas S/{soles(pagoCaraSello(sala.monto, sala.multiplicador))}
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={animando || sinSaldo}
                      onClick={() => void sentarse(sala.id)}
                      className="mt-4 w-full text-xs"
                    >
                      {sinSaldo ? "Saldo insuficiente" : `Ir con ${LADO_MONEDA_LABEL[miLado]}`}
                    </Button>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>

        {vista && vista.misDuelos.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
              Tus últimos duelos
            </h2>
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
                    <th className="px-3 py-2 font-semibold">Rival</th>
                    <th className="px-3 py-2 font-semibold">Tu lado</th>
                    <th className="px-3 py-2 font-semibold">Salió</th>
                    <th className="px-3 py-2 text-right font-semibold">Monto</th>
                    <th className="px-3 py-2 text-right font-semibold">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.misDuelos.map(({ sala, creadorNickname, rivalNickname }) => {
                    const soyCreador = sala.creador_id === user?.id;
                    const rival = soyCreador ? rivalNickname : creadorNickname;
                    const miLado = user ? ladoDe(sala, user.id) : null;
                    const gano = sala.ganador_id === user?.id;
                    return (
                      <tr key={sala.id} className="border-b border-gold-dark/20 last:border-0">
                        <td className="px-3 py-2 text-parchment/80">{rival ?? "—"}</td>
                        <td className="px-3 py-2 text-parchment/60">
                          {miLado ? LADO_MONEDA_LABEL[miLado] : "—"}
                        </td>
                        <td className="px-3 py-2 text-parchment/60">
                          {sala.resultado ? LADO_MONEDA_LABEL[sala.resultado] : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-parchment/60">
                          S/{soles(sala.monto)}
                        </td>
                        <td
                          className={clsx(
                            "px-3 py-2 text-right font-display font-bold",
                            gano ? "text-win-glow" : "text-lose-glow"
                          )}
                        >
                          {gano
                            ? `+S/${soles((sala.premio ?? 0) - sala.monto)}`
                            : `−S/${soles(sala.monto)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </section>
        ) : null}
      </main>
    </>
  );
}

function MiSala({ sala, onCancelar }: { sala: CaraSelloSala; onCancelar: () => void }) {
  return (
    <Panel className="border-gold-light/50 bg-gold/5 p-5">
      <p className="font-display text-sm font-bold uppercase tracking-wide text-gold-light">
        Tu sala está abierta
      </p>
      <p className="mt-2 text-sm text-parchment/70">
        Vas con <strong className="text-parchment">{LADO_MONEDA_LABEL[sala.lado_creador]}</strong>{" "}
        por <strong className="text-parchment">S/{soles(sala.monto)}</strong>. Cuando alguien
        se siente, la moneda cae sola y lo verás acá.
      </p>
      <p className="mt-2 text-[11px] text-parchment/40">
        Tu monto está apartado mientras esperas. Si cancelas, vuelve entero.
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancelar}
        className="mt-4 w-full text-xs"
      >
        Cancelar sala
      </Button>
    </Panel>
  );
}

function FormularioSala({
  config,
  saldo,
  onCreada,
  showToast,
}: {
  config: { cara_sello_min: number; cara_sello_max: number; cara_sello_multiplicador: number } | null;
  saldo: number;
  onCreada: () => Promise<void>;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [lado, setLado] = useState<LadoMoneda>("cara");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [creando, setCreando] = useState(false);

  const valor = Number(monto);
  const premio = config && valor > 0 ? pagoCaraSello(valor, config.cara_sello_multiplicador) : 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);

    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Escribe cuánto quieres apostar.");
      return;
    }
    if (valor > saldo) {
      setError("No te alcanza el saldo disponible.");
      return;
    }

    setCreando(true);
    try {
      const result = await crearSalaCaraSello({ lado, monto: valor });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: "Sala abierta",
        description: "Ahora falta que alguien se siente enfrente.",
      });
      setMonto("");
      await onCreada();
    } finally {
      setCreando(false);
    }
  }

  return (
    <Panel className="p-5">
      <form onSubmit={handleSubmit}>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-gold-light">
          Abrir una sala
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Elige tu lado">
          {(["cara", "sello"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={lado === opcion}
              onClick={() => setLado(opcion)}
              className={clsx(
                "min-h-14 rounded-lg border px-3 py-2 font-display text-sm font-extrabold uppercase tracking-wide transition",
                lado === opcion
                  ? "border-gold bg-gold/15 text-gold shadow-[0_0_20px_-8px_rgba(245,197,24,0.9)]"
                  : "border-gold-dark bg-obsidian/60 text-parchment/60 hover:border-gold/60"
              )}
            >
              <span aria-hidden className="mr-1">
                🪙
              </span>
              {LADO_MONEDA_LABEL[opcion]}
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

        {premio > 0 ? (
          <p className="mt-2 text-xs text-parchment/50">
            El rival pone lo mismo. Si ganas cobras{" "}
            <span className="text-gold-light">S/{soles(premio)}</span>
          </p>
        ) : null}

        <Button type="submit" disabled={creando || monto.trim() === ""} className="mt-4 w-full">
          {creando ? "Abriendo…" : "Abrir sala"}
        </Button>

        {error ? <p className="mt-3 text-sm text-lose-glow">{error}</p> : null}
      </form>
    </Panel>
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
