"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { PistaCarrera } from "@/components/sorteos/PistaCarrera";
import { useToast } from "@/context/ToastContext";
import {
  RondaAdmin,
  VistaCaballitos,
  cambiarEstadoRonda,
  finalizarRonda,
  getCaballitos,
  getRondas,
  girarRuleta,
  guardarRonda,
} from "@/actions/ruleta";
import { armarCaballosDeTickets } from "@/lib/carrera";
import { ESTADO_RONDA_LABEL, comisionMaxima, premioMinimo } from "@/lib/ruleta";

/**
 * CACHUDOBET → Caballitos.
 *
 * Es el panel de la ruleta pero con carreras: las rondas son las MISMAS
 * (`ruleta_rondas` con `modo = 'carrera'`, ver 0058), así que la compra de
 * tickets, el pozo, el premio y el sorteo son los que ya estaban probados.
 * Acá solo se crean, se abren, se corren y se cierran.
 *
 * El botón de largar es `girar_ruleta` sin disfraz: elige el ticket ganador,
 * paga y fija `giro_inicia_en`. Lo único distinto es que el resultado se ve
 * como una carrera en vez de una rueda.
 */

const soles = (n: number) => n.toFixed(2);

function AdminCaballitosContent() {
  const { showToast } = useToast();
  const [rondas, setRondas] = useState<RondaAdmin[] | null>(null);
  const [vista, setVista] = useState<VistaCaballitos | null>(null);
  const [desfase, setDesfase] = useState(0);
  const [procesando, setProcesando] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [premio, setPremio] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [lista, actual] = await Promise.all([getRondas("carrera"), getCaballitos()]);
    if (lista.ok) setRondas(lista.data);
    if (actual.ok) {
      setDesfase(new Date(actual.data.servidorAhora).getTime() - Date.now());
      setVista(actual.data);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    const id = setInterval(refresh, 3_000);
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

  async function handleCrear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorForm(null);
    setCreando(true);
    try {
      // `modo: "carrera"` es lo que separa esta ronda de las de la ruleta.
      const result = await guardarRonda({
        nombre,
        premioConcepto: premio,
        modo: "carrera",
      });
      if (!result.ok) {
        setErrorForm(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: `Carrera #${String(result.data.numero).padStart(4, "0")} creada`,
        description: "Ábrela para que empiecen a comprar caballos.",
      });
      setNombre("");
      setPremio("");
      await refresh();
    } finally {
      setCreando(false);
    }
  }

  const ronda = vista?.ronda ?? null;
  const caballos = armarCaballosDeTickets(vista?.tickets ?? []);
  const evento =
    ronda?.ronda.ganador_ticket_id && ronda.ronda.giro_inicia_en
      ? {
          ganadorCaballoId: ronda.ronda.ganador_ticket_id,
          semilla: `${ronda.ronda.id}:${ronda.ronda.girada_at ?? ""}`,
          iniciaEn: ronda.ronda.giro_inicia_en,
        }
      : null;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">Caballitos</h1>
        <p className="mt-2 max-w-2xl text-sm text-parchment/60">
          Cada ticket comprado es un caballo. Funciona con las mismas rondas y el mismo pozo
          que la ruleta — lo único que cambia es que el sorteo se ve como una carrera.
        </p>

        {/* ------------------------------------------------- crear ronda */}
        <Panel className="mt-6 p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Nueva carrera
          </h2>
          <form onSubmit={handleCrear} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label
                htmlFor="nombre"
                className="block text-[11px] uppercase tracking-wide text-parchment/40"
              >
                Nombre
              </label>
              <input
                id="nombre"
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  setErrorForm(null);
                }}
                placeholder="Carrera de fin de stream"
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </div>
            <div>
              <label
                htmlFor="premio"
                className="block text-[11px] uppercase tracking-wide text-parchment/40"
              >
                Premio (opcional)
              </label>
              <input
                id="premio"
                value={premio}
                onChange={(e) => setPremio(e.target.value)}
                placeholder="Se reparte el pozo"
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </div>
            <Button type="submit" disabled={creando || nombre.trim().length < 3} className="self-end">
              {creando ? "Creando…" : "Crear carrera"}
            </Button>
            {errorForm ? (
              <p className="text-sm text-lose-glow sm:col-span-3">{errorForm}</p>
            ) : null}
          </form>
        </Panel>

        {/* ---------------------------------------------------- la pista */}
        {ronda ? (
          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-gold-light">
                  Carrera #{String(ronda.ronda.numero).padStart(4, "0")} · {ronda.ronda.nombre}
                </h2>
                <p className="mt-0.5 text-xs text-parchment/45">
                  Pozo S/{soles(ronda.ronda.pozo_total)} · {ronda.totalTickets} caballos ·{" "}
                  {ronda.participantes.length} jugadores · premio desde S/
                  {soles(
                    ronda.ronda.premio_monto ??
                      premioMinimo(ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio)
                  )}{" "}
                  · casa hasta S/
                  {soles(
                    ronda.ronda.comision_monto ??
                      comisionMaxima(ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio)
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {ronda.ronda.estado === "borrador" || ronda.ronda.estado === "cerrada" ? (
                  <Button
                    type="button"
                    disabled={procesando === ronda.ronda.id}
                    onClick={() =>
                      accion(
                        ronda.ronda.id,
                        () => cambiarEstadoRonda({ rondaId: ronda.ronda.id, estado: "abierta" }),
                        { title: "Carrera abierta", description: "Ya pueden comprar caballos." }
                      )
                    }
                    className="min-h-9 px-3 py-1 text-xs"
                  >
                    Abrir
                  </Button>
                ) : null}

                {ronda.ronda.estado === "abierta" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={procesando === ronda.ronda.id}
                    onClick={() =>
                      accion(
                        ronda.ronda.id,
                        () => cambiarEstadoRonda({ rondaId: ronda.ronda.id, estado: "cerrada" }),
                        { title: "Carrera cerrada", description: "Ya no entran más caballos." }
                      )
                    }
                    className="min-h-9 px-3 py-1 text-xs"
                  >
                    Cerrar
                  </Button>
                ) : null}

                {ronda.ronda.estado === "cerrada" && !ronda.ronda.ganador_ticket_id ? (
                  <Button
                    type="button"
                    disabled={procesando === ronda.ronda.id || ronda.totalTickets === 0}
                    onClick={() =>
                      accion(ronda.ronda.id, () => girarRuleta(ronda.ronda.id), {
                        title: "¡Largaron!",
                        description: "Todos están viendo la misma carrera.",
                      })
                    }
                    className="min-h-11 px-5 text-sm"
                  >
                    🐎 Iniciar carrera
                  </Button>
                ) : null}

                {ronda.ronda.estado === "girando" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={procesando === ronda.ronda.id}
                    onClick={() =>
                      accion(ronda.ronda.id, () => finalizarRonda(ronda.ronda.id), {
                        title: "Carrera finalizada",
                      })
                    }
                    className="min-h-9 px-3 py-1 text-xs"
                  >
                    Finalizar
                  </Button>
                ) : null}
              </div>
            </div>

            <PistaCarrera
              caballos={caballos}
              evento={evento}
              desfaseMs={desfase}
              reducirMovimiento={false}
            />
          </section>
        ) : (
          <Panel className="mt-8 border-dashed p-6 text-center text-sm text-parchment/50">
            No hay ninguna carrera en curso. Crea una arriba y ábrela.
          </Panel>
        )}

        {/* ------------------------------------------------- el historial */}
        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">Historial</h2>
          {rondas === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : rondas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no has creado ninguna carrera.
            </Panel>
          ) : (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Nombre</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 text-right font-semibold">Pozo</th>
                    <th className="px-3 py-2 text-right font-semibold">Caballos</th>
                    <th className="px-3 py-2 text-right font-semibold">Premio</th>
                    <th className="px-3 py-2 text-right font-semibold">Casa</th>
                  </tr>
                </thead>
                <tbody>
                  {rondas.map(({ ronda: r, totalTickets, participantes }) => (
                    <tr key={r.id} className="border-b border-gold-dark/20 last:border-0">
                      <td className="px-3 py-2 text-parchment/50">
                        {String(r.numero).padStart(4, "0")}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-parchment/80">
                        {r.nombre}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={clsx(
                            "rounded-md border px-2 py-0.5 text-[11px]",
                            r.estado === "abierta"
                              ? "border-win-glow/50 text-win-glow"
                              : "border-gold-dark text-parchment/50"
                          )}
                        >
                          {ESTADO_RONDA_LABEL[r.estado]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gold-light">
                        S/{soles(r.pozo_total)}
                      </td>
                      <td className="px-3 py-2 text-right text-parchment/60">
                        {totalTickets} · {participantes} jug.
                      </td>
                      <td className="px-3 py-2 text-right text-parchment/70">
                        {r.premio_monto !== null ? `S/${soles(r.premio_monto)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-win-glow">
                        {r.comision_monto !== null ? `S/${soles(r.comision_monto)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </section>
      </main>
    </>
  );
}

export default function AdminCaballitosPage() {
  return (
    <RequireAdmin>
      <AdminCaballitosContent />
    </RequireAdmin>
  );
}
