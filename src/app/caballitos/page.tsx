"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { PistaCarrera } from "@/components/sorteos/PistaCarrera";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { VistaCaballitos, comprarTickets, getCaballitos } from "@/actions/ruleta";
import { armarCaballosDeTickets } from "@/lib/carrera";
import { premioMinimo, repartoParaGanador } from "@/lib/ruleta";

/**
 * Caballitos (0058).
 *
 * Es la ruleta con otra animación: los mismos tickets comprados con saldo, el
 * mismo pozo y el mismo premio. Cada ticket es un caballo, y `ganador_ticket_id`
 * apunta directo al que cruza primero.
 *
 * Por eso acá no hay matemática de plata: el premio se calcula con las mismas
 * funciones de `lib/ruleta` y el ganador ya vino decidido de Postgres.
 */

const soles = (n: number) => n.toFixed(2);

function CaballitosContent() {
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [vista, setVista] = useState<VistaCaballitos | null>(null);
  const [desfase, setDesfase] = useState(0);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getCaballitos();
    if (!result.ok) return;
    setDesfase(new Date(result.data.servidorAhora).getTime() - Date.now());
    setVista(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // 2s, para caber dentro de los 3 de cuenta regresiva y no perderse la
    // largada.
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

  const ronda = vista?.ronda ?? null;
  const caballos = armarCaballosDeTickets(vista?.tickets ?? []);

  // La semilla sale del id y del instante del giro. No hace falta guardarla:
  // conocerla no predice nada —el ganador se elige recién al girar— y así los
  // caballitos no necesitan una columna que la ruleta no usa.
  const evento =
    ronda?.ronda.ganador_ticket_id && ronda.ronda.giro_inicia_en
      ? {
          ganadorCaballoId: ronda.ronda.ganador_ticket_id,
          semilla: `${ronda.ronda.id}:${ronda.ronda.girada_at ?? ""}`,
          iniciaEn: ronda.ronda.giro_inicia_en,
        }
      : null;

  const miAporte = ronda ? (vista?.misTickets ?? 0) * ronda.ronda.precio_ticket : 0;
  const premio = ronda
    ? (ronda.ronda.premio_monto ??
      (vista && vista.misTickets > 0
        ? repartoParaGanador(miAporte, ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio)
            .premio
        : premioMinimo(ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio)))
    : 0;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">Caballitos</h1>
            <p className="mt-2 max-w-2xl text-sm text-parchment/60">
              Cada ticket es un caballo. Corren todos juntos y el primero en cruzar se lleva
              el premio — con la misma chance por caballo, tenga uno o veinte.
            </p>
          </div>
          <Link
            href="/juegos"
            className="text-xs font-semibold text-parchment/50 underline transition hover:text-gold"
          >
            ← Todos los juegos
          </Link>
        </div>

        {vista === null ? (
          <p className="mt-8 text-sm text-parchment/50">Cargando…</p>
        ) : !ronda ? (
          <Panel className="mt-8 border-dashed p-8 text-center">
            <p className="font-display text-lg text-parchment/70">No hay carrera abierta</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-parchment/45">
              Cuando el staff abra una, la pista aparece acá sola.
            </p>
          </Panel>
        ) : (
          <>
            <Panel className="mt-6 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold-light">
                    🐎 Carrera #{String(ronda.ronda.numero).padStart(4, "0")}
                  </p>
                  <p className="mt-1 truncate font-display text-xl font-bold text-parchment">
                    {ronda.ronda.nombre}
                  </p>
                  {ronda.ronda.premio_concepto ? (
                    <p className="mt-0.5 text-sm text-parchment/55">
                      {ronda.ronda.premio_concepto}
                    </p>
                  ) : null}
                </div>
                <span
                  className={clsx(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                    ronda.ronda.estado === "abierta"
                      ? "border-win-glow/50 bg-win/10 text-win-glow"
                      : "border-gold-dark text-parchment/45"
                  )}
                >
                  {ronda.ronda.estado === "abierta" ? "🟢 Abierta" : ronda.ronda.estado}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Dato label="Pozo" valor={`S/${soles(ronda.ronda.pozo_total)}`} tono="gold" />
                <Dato
                  label={
                    ronda.ronda.premio_monto !== null
                      ? "Premio"
                      : vista.misTickets > 0
                        ? "Si ganas tú"
                        : "Premio desde"
                  }
                  valor={`S/${soles(premio)}`}
                />
                <Dato label="Caballos" valor={String(ronda.totalTickets)} />
                <Dato label="Jugadores" valor={String(ronda.participantes.length)} />
              </div>
            </Panel>

            {ronda.ronda.estado === "abierta" ? (
              <PanelCompra
                precio={ronda.ronda.precio_ticket}
                saldo={user?.balance ?? 0}
                misTickets={vista.misTickets}
                rondaId={ronda.ronda.id}
                onComprado={async () => {
                  await Promise.all([refresh(), refreshUser()]);
                }}
                showToast={showToast}
              />
            ) : null}

            <div className="mt-6">
              <PistaCarrera
                caballos={caballos}
                evento={evento}
                desfaseMs={desfase}
                miUsuarioId={user?.id}
                reducirMovimiento={reducirMovimiento}
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}

function PanelCompra({
  precio,
  saldo,
  misTickets,
  rondaId,
  onComprado,
  showToast,
}: {
  precio: number;
  saldo: number;
  misTickets: number;
  rondaId: string;
  onComprado: () => Promise<void>;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [cantidad, setCantidad] = useState(1);
  const [comprando, setComprando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monto = Math.round(cantidad * precio * 100) / 100;

  async function handleComprar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (monto > saldo) {
      setError("No te alcanza el saldo disponible.");
      return;
    }

    setComprando(true);
    try {
      const result = await comprarTickets({ rondaId, monto });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: `${result.data.length} caballo(s) a la pista`,
        description: "Ya corren por ti en esta carrera.",
      });
      await onComprado();
    } finally {
      setComprando(false);
    }
  }

  return (
    <Panel className="mt-4 p-5">
      <form onSubmit={handleComprar} className="flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor="cantidad"
            className="block text-[11px] uppercase tracking-wide text-parchment/40"
          >
            Cuántos caballos (S/{soles(precio)} cada uno)
          </label>
          <input
            id="cantidad"
            type="number"
            min={1}
            max={200}
            step="1"
            value={cantidad}
            onChange={(e) => {
              setCantidad(Math.max(1, Number(e.target.value) || 1));
              setError(null);
            }}
            className="mt-1 min-h-11 w-32 rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
          />
        </div>

        <Button type="submit" disabled={comprando}>
          {comprando ? "Comprando…" : `Comprar por S/${soles(monto)}`}
        </Button>

        <p className="text-xs text-parchment/45">
          {misTickets > 0
            ? `Ya corres con ${misTickets} caballo(s).`
            : "Todavía no tienes caballos en esta carrera."}{" "}
          Tu saldo: S/{soles(saldo)}
        </p>

        {error ? <p className="w-full text-sm text-lose-glow">{error}</p> : null}
      </form>
    </Panel>
  );
}

function Dato({
  label,
  valor,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  tono?: "neutro" | "gold";
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p
        className={clsx(
          "font-display text-xl font-bold",
          tono === "gold" ? "text-gold-light" : "text-parchment"
        )}
      >
        {valor}
      </p>
    </div>
  );
}

export default function CaballitosPage() {
  return (
    <RequirePlayer>
      <CaballitosContent />
    </RequirePlayer>
  );
}
