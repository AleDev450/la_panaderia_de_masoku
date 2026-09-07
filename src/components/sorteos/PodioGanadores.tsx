"use client";

import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { GanadorCarrera } from "@/actions/sorteos";

/**
 * Los ganadores del sorteo, en el orden en que salieron.
 *
 * Antes esto era una línea de texto chiquita debajo de la pista ("Ya ganaron:
 * X, Y") y no se leía — que es un problema serio cuando ES el resultado del
 * sorteo. Acá va grande, con el puesto, el caballo exacto que cruzó y cuántos
 * caballos corría cada uno.
 *
 * El puesto sale del ORDEN de las carreras, no del flag `ganador` de la
 * inscripción: ese flag no guarda cuál salió primero, y con varios premios eso
 * es justamente el dato que se quiere ver.
 */

const MEDALLA = ["🥇", "🥈", "🥉"];

export function PodioGanadores({
  ganadores,
  miUsuarioId,
  titulo = "Ganadores",
}: {
  ganadores: GanadorCarrera[];
  miUsuarioId?: string;
  titulo?: string;
}) {
  if (ganadores.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
        🏆 {titulo}
        <span className="ml-2 text-sm font-normal text-parchment/45">
          {ganadores.length === 1 ? "1 premio entregado" : `${ganadores.length} premios entregados`}
        </span>
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ganadores.map((g) => {
          const mio = g.usuarioId === miUsuarioId;
          return (
            <Panel
              key={`${g.puesto}-${g.caballo}`}
              className={clsx(
                "p-5 text-center",
                // El primer puesto se destaca; los demás no compiten con él.
                g.puesto === 1
                  ? "border-gold/70 bg-gold/10"
                  : "border-gold-dark bg-charcoal/60",
                mio && "ring-1 ring-win-glow/60"
              )}
            >
              <p
                aria-hidden
                className={clsx("leading-none", g.puesto === 1 ? "text-5xl" : "text-4xl")}
              >
                {MEDALLA[g.puesto - 1] ?? "🏅"}
              </p>

              <p className="mt-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-parchment/45">
                {g.puesto}° premio
              </p>

              {/* El nombre es el dato: grande y sin truncar en varias líneas
                  si hace falta. */}
              <p
                className={clsx(
                  "mt-1 font-display font-black break-words",
                  g.puesto === 1 ? "text-3xl text-gold" : "text-2xl text-parchment"
                )}
              >
                {g.nickname}
              </p>

              <p className="mt-1.5 text-sm text-parchment/60">
                Ganó con <span className="text-parchment/90">{g.caballo}</span>
              </p>
              <p className="mt-0.5 text-xs text-parchment/40">
                Corría con {g.tickets} {g.tickets === 1 ? "caballo" : "caballos"}
              </p>

              {mio ? (
                <p className="mt-2 font-display text-sm font-bold text-win-glow">¡Eres tú!</p>
              ) : null}
            </Panel>
          );
        })}
      </div>
    </section>
  );
}
