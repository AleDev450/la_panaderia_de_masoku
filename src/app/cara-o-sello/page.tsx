"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { MesaCaraSello } from "@/components/caraSello/MesaCaraSello";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import {
  VistaCaraSello,
  cancelarSalaCaraSello,
  crearSalaCaraSello,
  getLobbyCaraSello,
  unirseCaraSello,
} from "@/actions/caraSello";
import { LadoMoneda } from "@/lib/supabase/types";
import { LADO_MONEDA_LABEL, ladoDe, pagoCaraSello } from "@/lib/caraSello";

/**
 * Salón de cara o sello.
 *
 * Funciona como las mesas de blackjack: las mesas se ven en vivo con los dos
 * jugadores sentados, y **la moneda la lanza el staff**. El jugador abre mesa
 * o se sienta en una, y espera mirando.
 *
 * Nada de esto decide el resultado: `admin_lanzar_moneda` ya lo escribió en
 * Postgres antes de que la primera pantalla empiece a animar. Acá solo se
 * mide contra el reloj del servidor para que todos vean lo mismo.
 */

const soles = (n: number) => n.toFixed(2);

function CaraSelloContent() {
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [vista, setVista] = useState<VistaCaraSello | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);

  /** Reloj del servidor menos el de este navegador. */
  const desfaseRef = useRef(0);
  const [desfase, setDesfase] = useState(0);
  /** Mesas cuyo resultado ya avisamos, para no repetir el toast en cada poll. */
  const avisadas = useRef<Set<string>>(new Set());
  const primeraCarga = useRef(true);

  const refresh = useCallback(async () => {
    const result = await getLobbyCaraSello();
    if (!result.ok) {
      setErrorCarga(result.error);
      return;
    }
    setErrorCarga(null);

    const nuevoDesfase = new Date(result.data.servidorAhora).getTime() - Date.now();
    desfaseRef.current = nuevoDesfase;
    setDesfase(nuevoDesfase);
    setVista(result.data);

    // En la primera carga no se avisa nada: entrar a la página no debería
    // anunciar duelos de hace media hora.
    if (primeraCarga.current) {
      primeraCarga.current = false;
      for (const m of result.data.mesas) avisadas.current.add(m.sala.id);
      return;
    }

    for (const { sala } of result.data.mesas) {
      if (sala.estado !== "resuelta" || avisadas.current.has(sala.id)) continue;
      avisadas.current.add(sala.id);

      const juego = sala.creador_id === user?.id || sala.rival_id === user?.id;
      if (!juego) continue;

      const gane = sala.ganador_id === user?.id;
      showToast(
        gane
          ? {
              variant: "success",
              title: "¡Ganaste!",
              description: `Se te acreditaron S/${soles(sala.premio ?? 0)}.`,
            }
          : { variant: "info", title: "Esta vez no", description: "Se la llevó tu rival." }
      );
      await refreshUser();
    }
  }, [user?.id, showToast, refreshUser]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // 2s, igual que la ruleta: es lo que tienen que cubrir los 3 segundos de
    // cuenta regresiva para que todos lleguen al lanzamiento.
    const id = setInterval(refresh, 2_000);
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
    showToast({
      variant: "success",
      title: "Estás sentado",
      description: "Ahora el staff lanza la moneda. Quédate mirando.",
    });
    await Promise.all([refresh(), refreshUser()]);
  }

  async function cancelar(salaId: string) {
    const result = await cancelarSalaCaraSello(salaId);
    if (!result.ok) {
      showToast({ variant: "warning", title: "No se pudo cancelar", description: result.error });
      return;
    }
    showToast({ variant: "info", title: "Mesa cancelada", description: "Te devolvimos tu monto." });
    await Promise.all([refresh(), refreshUser()]);
  }

  const mesas = vista?.mesas ?? [];
  // La mesa propia primero: es la que le importa a quien está jugando.
  const ordenadas = [...mesas].sort((a, b) => {
    const mia = (m: (typeof mesas)[number]) =>
      m.sala.creador_id === user?.id || m.sala.rival_id === user?.id ? 0 : 1;
    return mia(a) - mia(b);
  });

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">Cara o sello</h1>
            <p className="mt-2 max-w-xl text-sm text-parchment/60">
              Mesas de uno contra uno. Abre la tuya o siéntate en la de alguien; cuando la
              mesa se llena,{" "}
              <span className="text-parchment/85">el staff lanza la moneda en vivo</span> y
              todos la vemos caer al mismo tiempo.
            </p>
          </div>
          <p className="text-xs text-parchment/45">
            Tu saldo:{" "}
            <span className="font-display text-sm font-bold text-gold">
              S/{soles(user?.balance ?? 0)}
            </span>
          </p>
        </div>

        {!vista?.miSala ? (
          <FormularioSala
            config={vista?.config ?? null}
            saldo={user?.balance ?? 0}
            onCreada={async () => {
              await Promise.all([refresh(), refreshUser()]);
            }}
            showToast={showToast}
          />
        ) : null}

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Mesas en vivo
          </h2>

          {vista === null ? (
            errorCarga ? (
              <Panel className="border-dashed p-6 text-center">
                <p className="text-sm text-lose-glow">No se pudieron cargar las mesas.</p>
                <p className="mt-1 text-xs text-parchment/45">{errorCarga}</p>
              </Panel>
            ) : (
              <p className="text-sm text-parchment/50">Cargando…</p>
            )
          ) : ordenadas.length === 0 ? (
            <Panel className="border-dashed p-8 text-center">
              <p className="font-display text-lg text-parchment/70">No hay mesas abiertas</p>
              <p className="mt-1 text-sm text-parchment/45">
                Abre la tuya arriba y espera a que alguien se siente.
              </p>
            </Panel>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ordenadas.map((item) => (
                <MesaCaraSello
                  key={item.sala.id}
                  item={item}
                  miUsuarioId={user?.id}
                  saldo={user?.balance ?? 0}
                  desfaseMs={desfase}
                  reducirMovimiento={reducirMovimiento}
                  ocupado={vista.miSala !== null}
                  onUnirse={sentarse}
                  onCancelar={cancelar}
                />
              ))}
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
        title: "Mesa abierta",
        description: "Cuando alguien se siente, el staff lanza la moneda.",
      });
      setMonto("");
      await onCreada();
    } finally {
      setCreando(false);
    }
  }

  return (
    <Panel className="mt-6 p-5">
      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-end">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-parchment/40">Tu lado</p>
          <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="Elige tu lado">
            {(["cara", "sello"] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={lado === opcion}
                onClick={() => setLado(opcion)}
                className={clsx(
                  "min-h-11 rounded-lg border px-4 py-2 font-display text-sm font-extrabold uppercase tracking-wide transition",
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
        </div>

        <div>
          <label
            htmlFor="monto-moneda"
            className="block text-[11px] uppercase tracking-wide text-parchment/40"
          >
            Monto
            {config
              ? ` (S/${soles(config.cara_sello_min)} – S/${soles(config.cara_sello_max)})`
              : ""}
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
            <p className="mt-1 text-xs text-parchment/50">
              Tu rival pone lo mismo. Si ganas cobras{" "}
              <span className="text-gold-light">S/{soles(premio)}</span>
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={creando || monto.trim() === ""} className="lg:w-40">
          {creando ? "Abriendo…" : "Abrir mesa"}
        </Button>

        {error ? <p className="text-sm text-lose-glow lg:col-span-3">{error}</p> : null}
      </form>
    </Panel>
  );
}

export default function CaraSelloPage() {
  return (
    <RequirePlayer>
      <CaraSelloContent />
    </RequirePlayer>
  );
}
