"use client";

import { useEffect, useState } from "react";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { useSession } from "@/context/SessionContext";
import { JugadorRanking, getRanking } from "@/actions/perfil";
import { PUNTOS_POR_GANAR, PUNTOS_POR_PERDER } from "@/types";
import clsx from "clsx";

/**
 * Solo puestos: número, nickname y puntos.
 *
 * Antes cada fila traía la insignia de rango y al costado iba el catálogo
 * de niveles. Con tres datos por fila (puesto, nombre, rango, puntos) la
 * fila competía consigo misma y el puesto —lo único que se viene a ver a
 * un ranking— era lo menos visible. Los niveles vuelven cuando estén
 * definidos.
 */

/** Oro, plata y bronce para el podio; el resto en gris. */
function colorPuesto(puesto: number): string {
  if (puesto === 1) return "#f5c518";
  if (puesto === 2) return "#cfd3dc";
  if (puesto === 3) return "#c87f3a";
  return "#5a5a63";
}

function RankingContent() {
  const { user } = useSession();
  const [ranking, setRanking] = useState<JugadorRanking[] | null>(null);

  useEffect(() => {
    getRanking().then((result) => {
      if (result.ok) setRanking(result.data);
    });
  }, []);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-parchment">
          Ranking
        </h1>
        <p className="mt-2 text-sm text-parchment/55">
          Gana un duelo emparejado y sumas{" "}
          <span className="font-semibold text-win-glow">{PUNTOS_POR_GANAR} puntos</span>; si
          pierdes, igual sumas{" "}
          <span className="font-semibold text-gold">{PUNTOS_POR_PERDER} punto</span>.
        </p>

        <div className="mt-8">
          {ranking === null ? (
            <Panel className="p-6 text-center text-sm text-parchment/50">
              Cargando ranking…
            </Panel>
          ) : ranking.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no hay cachudos con puntos.
            </Panel>
          ) : (
            <ol className="flex flex-col gap-2">
              {ranking.map((ranked, index) => {
                const puesto = index + 1;
                const soyYo = ranked.id === user?.id;
                return (
                  <li key={ranked.id}>
                    <Panel
                      className={clsx(
                        "flex items-center gap-4 px-4 py-3.5",
                        soyYo && "border-gold/70 bg-gold/5"
                      )}
                    >
                      <span
                        className="w-9 shrink-0 text-center font-display text-2xl font-extrabold tabular-nums"
                        style={{ color: colorPuesto(puesto) }}
                      >
                        {puesto}
                      </span>

                      <span className="min-w-0 flex-1 truncate font-display text-base font-bold text-parchment">
                        {ranked.nickname}
                        {soyYo ? (
                          <span className="ml-2 align-middle text-xs font-semibold text-gold">
                            (tú)
                          </span>
                        ) : null}
                      </span>

                      <span className="shrink-0 text-right">
                        <span className="font-display text-lg font-extrabold tabular-nums text-gold">
                          {ranked.puntos}
                        </span>
                        <span className="ml-1 text-xs text-parchment/40">pts</span>
                      </span>
                    </Panel>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </main>
    </>
  );
}

export default function RankingPage() {
  return (
    <RequirePlayer>
      <RankingContent />
    </RequirePlayer>
  );
}
