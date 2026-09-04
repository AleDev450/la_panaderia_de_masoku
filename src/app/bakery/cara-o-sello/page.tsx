"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import {
  JugadaConUsuario,
  SalaConJugadores,
  cancelarSalaCaraSello,
  getHistorialCaraSello,
  getMesasAdmin,
  getMetricasCaraSello,
  lanzarMoneda,
} from "@/actions/caraSello";
import { MetricasCaraSello } from "@/lib/supabase/types";
import { LADO_MONEDA_LABEL } from "@/lib/caraSello";

/**
 * CACHUDOBET → Cara o sello. Solo lectura: no hay nada que declarar ni
 * aprobar, porque cada duelo se resuelve y se paga solo en Postgres.
 *
 * Desde 0050 el juego es 1v1: los dos jugadores ponen el mismo monto y la
 * casa se queda la diferencia entre el pozo y el premio — 0.20 por sol con
 * multiplicador 1.8, salga cara o sello. `Resultado casa` es esa comisión y
 * no depende del resultado: la casa no corre riesgo, igual que en el motor
 * de apuestas.
 *
 * Cada duelo escribe DOS filas en `cara_sello_jugadas`, una por jugador, así
 * que "Jugadas" cuenta manos por persona y no duelos.
 */

const soles = (n: number) => n.toFixed(2);

function AdminCaraSelloContent() {
  const { showToast } = useToast();
  const [metricas, setMetricas] = useState<MetricasCaraSello | null>(null);
  const [historial, setHistorial] = useState<JugadaConUsuario[] | null>(null);
  const [mesas, setMesas] = useState<SalaConJugadores[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [m, h, s] = await Promise.all([
      getMetricasCaraSello(),
      getHistorialCaraSello(),
      getMesasAdmin(),
    ]);
    setMetricas(m.ok ? m.data : null);
    setHistorial(h.ok ? h.data : []);
    setMesas(s.ok ? s.data : []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // 5s como /bakery/titulos: las mesas se llenan mientras miras, y hay que
    // ver cuál está lista para lanzar sin recargar a mano.
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function accion(
    id: string,
    ejecutar: () => Promise<{ ok: true } | { ok: false; error: string }>,
    exito: { title: string; description?: string }
  ) {
    setProcesando(id);
    try {
      const result = await ejecutar();
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo", description: result.error });
        return;
      }
      showToast({ variant: "success", ...exito });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  const pendientes = (mesas ?? []).filter(
    (m) => m.sala.estado === "esperando" || m.sala.estado === "lista"
  );

  const totalResultados = metricas ? metricas.salio_cara + metricas.salio_sello : 0;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">
          CACHUDOBET · Cara o sello
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          El resultado de cada jugada lo decide Postgres y se paga en el acto. Acá solo se
          mira cómo va.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Mesas por atender
          </h2>

          {mesas === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              No hay mesas esperando. Cuando dos jugadores se sienten, aparece acá el botón
              para lanzar.
            </Panel>
          ) : (
            <div className="space-y-3">
              {pendientes.map(({ sala, creadorNickname, rivalNickname }) => {
                const lista = sala.estado === "lista";
                const enCurso = procesando === sala.id;
                return (
                  <Panel
                    key={sala.id}
                    className={clsx("p-5", lista && "border-gold/60 bg-gold/5")}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-base font-semibold text-parchment">
                          {creadorNickname}{" "}
                          <span className="text-xs font-normal text-gold">
                            ({LADO_MONEDA_LABEL[sala.lado_creador]})
                          </span>
                          <span className="mx-2 text-parchment/40">vs</span>
                          {rivalNickname ? (
                            <>
                              {rivalNickname}{" "}
                              <span className="text-xs font-normal text-parchment/60">
                                ({LADO_MONEDA_LABEL[sala.lado_creador === "cara" ? "sello" : "cara"]}
                                )
                              </span>
                            </>
                          ) : (
                            <span className="text-parchment/40">silla libre</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-parchment/45">
                          S/{soles(sala.monto)} cada uno · pozo S/{soles(sala.monto * 2)} · premio
                          S/{soles(sala.monto * sala.multiplicador)} · casa S/
                          {soles(sala.monto * 2 - sala.monto * sala.multiplicador)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {lista ? (
                          <Button
                            type="button"
                            disabled={enCurso}
                            onClick={() =>
                              accion(sala.id, () => lanzarMoneda(sala.id), {
                                title: "¡Moneda en el aire!",
                                description: "Los dos jugadores están viendo el mismo lanzamiento.",
                              })
                            }
                            className="min-h-9 px-4 py-1 text-xs"
                          >
                            {enCurso ? "Lanzando…" : "🪙 Lanzar moneda"}
                          </Button>
                        ) : (
                          <span className="self-center rounded-full border border-gold-dark px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-parchment/45">
                            Falta rival
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={enCurso}
                          onClick={() =>
                            accion(sala.id, () => cancelarSalaCaraSello(sala.id), {
                              title: "Mesa cancelada",
                              description: "Se devolvió lo retenido.",
                            })
                          }
                          className="min-h-9 px-3 py-1 text-xs"
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metrica label="Jugadas" valor={metricas ? String(metricas.jugadas) : "—"} detalle="Manos jugadas" />
          <Metrica
            label="Jugadores"
            valor={metricas ? String(metricas.jugadores) : "—"}
            detalle="Cuentas distintas"
          />
          <Metrica
            label="Apostado"
            valor={metricas ? `S/${soles(metricas.monto_apostado)}` : "—"}
            detalle="Volumen total"
          />
          <Metrica
            label="Comisión casa"
            valor={metricas ? `S/${soles(metricas.resultado_casa)}` : "—"}
            detalle="Apostado − pagado"
            tono={metricas && metricas.resultado_casa < 0 ? "lose" : "win"}
          />
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metrica
            label="Pagado"
            valor={metricas ? `S/${soles(metricas.monto_pagado)}` : "—"}
            detalle="Premios acreditados"
            tono="lose"
          />
          <Metrica
            label="Manos ganadas"
            valor={metricas ? String(metricas.jugadas_ganadas) : "—"}
            detalle="Cobraron premio"
          />
          <Metrica
            label="Manos perdidas"
            valor={metricas ? String(metricas.jugadas_perdidas) : "—"}
            detalle="Perdieron su monto"
          />
          <Metrica
            label="Cara / Sello"
            valor={metricas ? `${metricas.salio_cara} / ${metricas.salio_sello}` : "—"}
            detalle={
              totalResultados > 0
                ? `${Math.round((metricas!.salio_cara / totalResultados) * 100)}% cara`
                : "Sin jugadas"
            }
          />
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Últimas 100 jugadas
          </h2>

          {historial === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : historial.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía nadie ha jugado.
            </Panel>
          ) : (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
                    <th className="px-3 py-2 font-semibold">Fecha</th>
                    <th className="px-3 py-2 font-semibold">Jugador</th>
                    <th className="px-3 py-2 font-semibold">Eligió</th>
                    <th className="px-3 py-2 font-semibold">Salió</th>
                    <th className="px-3 py-2 text-right font-semibold">Apostó</th>
                    <th className="px-3 py-2 text-right font-semibold">Pagó la casa</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map(({ jugada, nickname }) => (
                    <tr key={jugada.id} className="border-b border-gold-dark/20 last:border-0">
                      <td className="px-3 py-2 text-parchment/50">
                        {new Date(jugada.created_at).toLocaleString("es-PE", {
                          timeZone: "America/Lima",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 text-parchment/80">{nickname}</td>
                      <td className="px-3 py-2 text-parchment/60">
                        {LADO_MONEDA_LABEL[jugada.eleccion]}
                      </td>
                      <td
                        className={clsx(
                          "px-3 py-2 font-semibold",
                          jugada.gano ? "text-win-glow" : "text-lose-glow"
                        )}
                      >
                        {LADO_MONEDA_LABEL[jugada.resultado]}
                      </td>
                      <td className="px-3 py-2 text-right text-parchment/70">
                        S/{soles(jugada.monto)}
                      </td>
                      <td className="px-3 py-2 text-right text-parchment/70">
                        {jugada.gano ? `S/${soles(jugada.pago)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
            Cada duelo aparece como <strong className="text-parchment/60">dos filas</strong>,
            una por jugador: una en verde (cobró el premio) y otra en rojo (perdió su monto).
            La casa se queda la diferencia, gane quien gane.
          </p>
        </section>
      </main>
    </>
  );
}

function Metrica({
  label,
  valor,
  detalle,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  detalle: string;
  tono?: "neutro" | "win" | "lose";
}) {
  const color = tono === "win" ? "text-win-glow" : tono === "lose" ? "text-lose-glow" : "text-parchment";
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${color}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-parchment/40">{detalle}</p>
    </Panel>
  );
}

export default function AdminCaraSelloPage() {
  return (
    <RequireAdmin>
      <AdminCaraSelloContent />
    </RequireAdmin>
  );
}
