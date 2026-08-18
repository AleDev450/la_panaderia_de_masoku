"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { ApuestaConEvento, getMisApuestasConEvento } from "@/actions/betting";
import { CategoriaBadge } from "@/components/partidas/CategoriaBadge";
import { ladoLabel, liquidacionDeApuesta } from "@/lib/apuestas";

function HistorialContent() {
  const [apuestas, setApuestas] = useState<ApuestaConEvento[] | null>(null);

  useEffect(() => {
    getMisApuestasConEvento().then((result) => {
      if (result.ok) setApuestas(result.data);
    });
  }, []);

  const terminadas = (apuestas ?? []).filter(
    ({ evento }) => evento.estado === "resuelto" || evento.estado === "cancelado"
  );

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Historial</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Tus apuestas en títulos ya resueltos o cancelados. Lo emparejado
          se paga a cuota 1.80x; lo que nunca llegó a cubrirse volvió a tu
          saldo.
        </p>

        {apuestas === null ? (
          <p className="mt-8 text-sm text-parchment/50">Cargando…</p>
        ) : terminadas.length === 0 ? (
          <Panel className="mt-8 border-dashed p-6 text-center text-sm text-parchment/50">
            Aún no tienes apuestas resueltas en tu historial.
          </Panel>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {terminadas.map(({ apuesta, evento }) => {
              if (evento.estado === "cancelado") {
                return (
                  <li key={apuesta.id}>
                    <Panel className="flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-parchment">{evento.nombre}</p>
                          <p className="mt-0.5 text-xs text-parchment/50">
                            Tu lado: {ladoLabel(evento, apuesta.lado)}
                          </p>
                        </div>
                        <CategoriaBadge categoria={evento.categoria} />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="rounded-md border border-lose-glow/60 bg-lose/10 px-2.5 py-1 font-fantasy text-xs font-bold uppercase tracking-wide text-lose-glow">
                          Cancelada
                        </span>
                        <span className="text-xs text-parchment/50">
                          Se te devolvió S/{apuesta.monto_total} por completo
                        </span>
                      </div>
                    </Panel>
                  </li>
                );
              }

              const liq = liquidacionDeApuesta(apuesta, evento);
              if (!liq) return null;

              return (
                <li key={apuesta.id}>
                  <Panel className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-parchment">{evento.nombre}</p>
                        <p className="mt-0.5 text-xs text-parchment/50">
                          Tu lado: {ladoLabel(evento, apuesta.lado)} · Resultado:{" "}
                          <span className="font-semibold text-gold-light">
                            {ladoLabel(evento, evento.resultado!)}
                          </span>
                        </p>
                      </div>
                      <CategoriaBadge categoria={evento.categoria} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span
                        className={clsx(
                          "rounded-md border px-2.5 py-1 font-fantasy text-xs font-bold uppercase tracking-wide",
                          liq.gano
                            ? "border-win-glow/60 bg-win/10 text-win-glow"
                            : "border-lose-glow/60 bg-lose/10 text-lose-glow"
                        )}
                      >
                        {liq.gano ? `Ganaste S/${liq.cobrado}` : `Perdiste S/${liq.perdido}`}
                      </span>
                      <span className="text-xs text-parchment/50">
                        Apostaste S/{apuesta.monto_total} · emparejado S/
                        {apuesta.monto_matcheado}
                        {liq.devuelto > 0 ? ` · devuelto S/${liq.devuelto}` : ""}
                      </span>
                    </div>
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}

export default function HistorialPage() {
  return (
    <RequirePlayer>
      <HistorialContent />
    </RequirePlayer>
  );
}
