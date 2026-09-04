"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { VistaRuleta, getRuleta } from "@/actions/ruleta";
import { ESTADO_RONDA_LABEL, premioMinimo, repartoParaGanador } from "@/lib/ruleta";

/**
 * La ronda en curso, resumida para el home del jugador.
 *
 * Se carga solo (no recibe props) para que meterlo en una página existente
 * sea una línea y no un refactor de su estado. Si la migración 0048 todavía
 * no corrió, no se renderiza nada en vez de romper la pantalla.
 */

const soles = (n: number) => n.toFixed(2);

export function HeroRonda() {
  const [vista, setVista] = useState<VistaRuleta | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const result = await getRuleta();
      if (vivo && result.ok) setVista(result.data);
    };
    void cargar();
    const id = setInterval(cargar, 10_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  // Hasta que la primera lectura conteste no se pinta nada. Eso cubre dos
  // casos con el mismo camino: la carga inicial y una base sin la migración
  // 0048 corrida — en los dos, un hueco es mejor que un "sin ronda" que
  // parece un dato.
  if (!vista) return null;

  const ronda = vista.ronda;

  // El premio depende de CUÁNTO puso el que gane (0051), así que antes de
  // girar no existe un número único. Si el que mira ya compró tickets, se le
  // muestra EL SUYO —que es el que le importa— y no el piso de la ronda:
  // "Premio desde S/50" cuando a ti te tocarían S/56 es un dato correcto
  // contestando una pregunta que nadie hizo.
  const miAporte = ronda ? vista.misTickets * ronda.ronda.precio_ticket : 0;
  const esMio = ronda !== null && ronda.ronda.premio_monto === null && vista.misTickets > 0;

  const premio = ronda
    ? (ronda.ronda.premio_monto ??
      (esMio
        ? repartoParaGanador(miAporte, ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio)
            .premio
        : premioMinimo(ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio)))
    : 0;

  return (
    <section className="mb-8 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <Panel
        glow
        className={clsx(
          "relative overflow-hidden p-5 sm:p-6",
          ronda?.ronda.estado === "girando" && "border-gold/60"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold-light">
              🎡 Ruleta CACHUDOBET
            </p>
            <p className="mt-1 truncate font-display text-xl font-bold text-parchment">
              {ronda
                ? `Ronda #${String(ronda.ronda.numero).padStart(4, "0")} · ${ronda.ronda.nombre}`
                : "Sin ronda activa"}
            </p>
          </div>
          {ronda ? (
            <span
              className={clsx(
                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                ronda.ronda.estado === "abierta"
                  ? "border-win-glow/50 bg-win/10 text-win-glow"
                  : ronda.ronda.estado === "girando"
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-gold-dark text-parchment/45"
              )}
            >
              {ronda.ronda.estado === "abierta" ? "🟢 " : ""}
              {ESTADO_RONDA_LABEL[ronda.ronda.estado]}
            </span>
          ) : null}
        </div>

        {ronda ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dato label="Pozo" valor={`S/${soles(ronda.ronda.pozo_total)}`} tono="gold" />
            <Dato
              label={
                ronda.ronda.premio_monto !== null
                  ? "Premio"
                  : esMio
                    ? "Si ganas tú"
                    : "Premio desde"
              }
              valor={`S/${soles(premio)}`}
              tono={esMio ? "gold" : "neutro"}
            />
            <Dato label="Tickets" valor={String(ronda.totalTickets)} />
            <Dato label="Jugadores" valor={String(ronda.participantes.length)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-parchment/50">
            Cuando el staff abra una ronda, el pozo aparece acá.
          </p>
        )}

        <Link
          href="/ruleta"
          className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-gold bg-gold px-5 py-2.5 font-display text-sm font-extrabold uppercase tracking-wide text-obsidian transition hover:bg-gold-light focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          Ver ruleta
        </Link>
      </Panel>

      <Link href="/cara-o-sello" className="block">
        <Panel glow className="flex h-full flex-col justify-between p-5">
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold-light">
              🪙 Cara o sello
            </p>
            <p className="mt-2 text-sm text-parchment/60">
              Uno contra uno: mismo monto, un lado cada quien.
            </p>
          </div>
          <p className="mt-4 font-display text-2xl font-bold text-parchment">
            {vista.config.cara_sello_multiplicador}x{" "}
            <span className="text-sm font-normal text-parchment/50">si aciertas</span>
          </p>
        </Panel>
      </Link>
    </section>
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
