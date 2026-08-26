"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { CategoriaBadge } from "@/components/partidas/CategoriaBadge";
import { ResultadoReciente, getUltimosResultados } from "@/actions/betting";

/** Fecha y hora en calendario de Perú — el servidor puede estar en UTC y el
 * navegador del jugador en cualquier huso; ninguno de los dos decide acá. */
function fechaHoraPeru(iso: string) {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
  });
  const hora = d.toLocaleTimeString("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return { fecha, hora };
}

/**
 * Últimas partidas resueltas. Muestra qué lado ganó y nada más: ni montos,
 * ni cuánta gente había de cada lado. Eso último sería información de
 * mercado, y empujaría a copiar al bando que va ganando en vez de decidir
 * por la partida — ver `getUltimosResultados`.
 */
export function HistorialReciente({ limite = 5 }: { limite?: number }) {
  const [resultados, setResultados] = useState<ResultadoReciente[] | null>(null);

  useEffect(() => {
    let vigente = true;
    const cargar = () =>
      getUltimosResultados(limite).then((result) => {
        // El componente puede desmontarse antes de que vuelva la consulta.
        if (vigente) setResultados(result.ok ? result.data : []);
      });

    cargar();
    // Sin esto, una partida que termina mientras miras la pantalla no
    // aparece hasta recargar. Más espaciado que el refresco de salas (10s)
    // porque un resultado nuevo no es algo que pase cada minuto.
    const id = setInterval(cargar, 30_000);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, [limite]);

  return (
    <section aria-labelledby="historial-reciente">
      <h2
        id="historial-reciente"
        className="mb-3 font-fantasy text-lg font-semibold text-gold-light"
      >
        Últimos resultados
      </h2>

      {resultados === null ? (
        <p className="text-sm text-parchment/50">Cargando…</p>
      ) : resultados.length === 0 ? (
        <Panel className="border-dashed p-5 text-center text-sm text-parchment/50">
          Todavía no hay partidas terminadas.
        </Panel>
      ) : (
        <ul className="space-y-3">
          {resultados.map((r) => {
            const { fecha, hora } = fechaHoraPeru(r.resueltoEn);
            const ganoA = r.resultado === "a";
            return (
              <li key={r.id}>
                <Panel className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] tracking-wide text-parchment/40">
                      {fecha} · {hora}
                    </p>
                    <CategoriaBadge categoria={r.categoria} />
                  </div>

                  <p className="mt-2 text-sm leading-snug font-semibold text-parchment">
                    {r.nombre}
                  </p>

                  <div className="mt-3 space-y-1.5">
                    <LadoResultado nombre={r.ladoA} gano={ganoA} />
                    <LadoResultado nombre={r.ladoB} gano={!ganoA} />
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LadoResultado({ nombre, gano }: { nombre: string; gano: boolean }) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
        gano ? "border-win-glow/50 bg-win/10" : "border-lose-glow/30 bg-lose/5"
      )}
    >
      <span
        className={clsx(
          "min-w-0 truncate text-xs font-semibold",
          gano ? "text-win-glow" : "text-parchment/40"
        )}
      >
        {nombre}
      </span>
      <span
        className={clsx(
          "shrink-0 text-[10px] font-bold uppercase tracking-wide",
          gano ? "text-win-glow" : "text-lose-glow/70"
        )}
      >
        {gano ? "Ganó" : "Perdió"}
      </span>
    </div>
  );
}
