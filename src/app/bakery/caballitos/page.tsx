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
  cancelarRonda,
  finalizarRonda,
  getCaballitos,
  getConfig,
  getRondas,
  girarRuleta,
  guardarRonda,
} from "@/actions/ruleta";
import { RuletaRonda } from "@/lib/supabase/types";
import { armarCaballosDeTickets } from "@/lib/carrera";
import { ESTADO_RONDA_LABEL, comisionMaxima, premioMinimo } from "@/lib/ruleta";

/**
 * CACHUDOBET → Caballitos.
 *
 * Las rondas son las MISMAS de la ruleta (`ruleta_rondas` con
 * `modo = 'carrera'`, 0058), así que la compra de tickets, el pozo, el premio
 * y el sorteo son los que ya estaban probados. Acá se crean, se editan, se
 * abren, se corren y se cierran.
 *
 * LA LISTA MANDA, NO LA PISTA. La primera versión de esta pantalla solo
 * mostraba la ronda "en curso", que sale de `getCaballitos()` — y esa consulta
 * NO devuelve las de estado `borrador`. Resultado: una carrera recién creada
 * quedaba invisible y sin forma de abrirla. Ahora la lista viene de
 * `getRondas('carrera')`, que las trae todas, y cada fila lleva sus acciones.
 */

const soles = (n: number) => n.toFixed(2);

type Borrador = {
  rondaId: string | null;
  nombre: string;
  premio: string;
  precio: string;
  /** Vacío = sin tope. */
  tope: string;
};

const NUEVA: Borrador = { rondaId: null, nombre: "", premio: "", precio: "", tope: "" };

function AdminCaballitosContent() {
  const { showToast } = useToast();
  const [rondas, setRondas] = useState<RondaAdmin[] | null>(null);
  const [vista, setVista] = useState<VistaCaballitos | null>(null);
  const [desfase, setDesfase] = useState(0);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [precioPorDefecto, setPrecioPorDefecto] = useState<number | null>(null);

  const [form, setForm] = useState<Borrador>(NUEVA);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Cancelar devuelve plata: no se ejecuta de un clic suelto.
  const [cancelando, setCancelando] = useState<RuletaRonda | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");

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
    getConfig().then((r) => {
      if (r.ok) setPrecioPorDefecto(r.data.precio_ticket);
    });
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

  async function handleGuardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorForm(null);
    setGuardando(true);
    try {
      const precio = form.precio.trim() === "" ? undefined : Number(form.precio);
      if (precio !== undefined && (!Number.isFinite(precio) || precio <= 0)) {
        setErrorForm("El precio del ticket debe ser un número mayor a 0.");
        return;
      }

      const tope = form.tope.trim() === "" ? null : Number(form.tope);
      if (tope !== null && (!Number.isInteger(tope) || tope < 1)) {
        setErrorForm("El tope por persona debe ser un número entero de 1 o más.");
        return;
      }

      const result = await guardarRonda({
        rondaId: form.rondaId,
        nombre: form.nombre,
        premioConcepto: form.premio,
        // Lo que separa esta ronda de las de la ruleta.
        modo: "carrera",
        precioTicket: precio,
        maxTickets: tope,
      });
      if (!result.ok) {
        setErrorForm(result.error);
        return;
      }

      showToast({
        variant: "success",
        title: form.rondaId
          ? "Carrera actualizada"
          : `Carrera #${String(result.data.numero).padStart(4, "0")} creada`,
        description: form.rondaId ? undefined : "Ábrela para que empiecen a comprar caballos.",
      });
      setForm(NUEVA);
      await refresh();
    } finally {
      setGuardando(false);
    }
  }

  function editar(r: RuletaRonda) {
    setErrorForm(null);
    setForm({
      rondaId: r.id,
      nombre: r.nombre,
      premio: r.premio_concepto ?? "",
      precio: String(r.precio_ticket),
      tope: r.max_tickets_por_persona === null ? "" : String(r.max_tickets_por_persona),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Solo las que ya se corrieron: una carrera sin girar no dejó ni premio ni
  // comisión, y meterla en el total inflaría lo recaudado con plata que
  // todavía puede devolverse.
  const corridas = (rondas ?? []).filter((r) => r.ronda.ganador_ticket_id !== null);

  const totales = corridas.reduce(
    (acc, { ronda: r, totalTickets }) => ({
      recaudado: acc.recaudado + Number(r.pozo_total),
      premios: acc.premios + Number(r.premio_monto ?? 0),
      casa: acc.casa + Number(r.comision_monto ?? 0),
      caballos: acc.caballos + totalTickets,
      porCaballo: 0,
    }),
    { recaudado: 0, premios: 0, casa: 0, caballos: 0, porCaballo: 0 }
  );
  totales.porCaballo = totales.caballos > 0 ? totales.recaudado / totales.caballos : 0;

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
          Cada ticket comprado es un caballo. Usa las mismas rondas y el mismo pozo que la
          ruleta — lo único que cambia es que el sorteo se ve como una carrera.
        </p>

        {/* ------------------------------------------------ crear / editar */}
        <Panel className={clsx("mt-6 p-5", form.rondaId && "border-gold/60 bg-gold/5")}>
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            {form.rondaId ? "Editar carrera" : "Nueva carrera"}
          </h2>

          <form onSubmit={handleGuardar} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-parchment/40">Nombre</span>
              <input
                value={form.nombre}
                onChange={(e) => {
                  setForm({ ...form, nombre: e.target.value });
                  setErrorForm(null);
                }}
                placeholder="Carrera de fin de stream"
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-parchment/40">
                Premio (opcional)
              </span>
              <input
                value={form.premio}
                onChange={(e) => setForm({ ...form, premio: e.target.value })}
                placeholder="Se reparte el pozo"
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-parchment/40">
                Precio por caballo
                {precioPorDefecto !== null ? ` (por defecto S/${soles(precioPorDefecto)})` : ""}
              </span>
              <input
                type="number"
                min={1}
                step="0.5"
                value={form.precio}
                onChange={(e) => {
                  setForm({ ...form, precio: e.target.value });
                  setErrorForm(null);
                }}
                placeholder={precioPorDefecto !== null ? soles(precioPorDefecto) : "3.00"}
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-parchment/40">
                Máximo de caballos por persona (vacío = sin tope)
              </span>
              <input
                type="number"
                min={1}
                step="1"
                value={form.tope}
                onChange={(e) => {
                  setForm({ ...form, tope: e.target.value });
                  setErrorForm(null);
                }}
                placeholder="Sin tope"
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </label>

            <div className="flex items-end gap-2">
              <Button type="submit" disabled={guardando || form.nombre.trim().length < 3}>
                {guardando ? "Guardando…" : form.rondaId ? "Guardar cambios" : "Crear carrera"}
              </Button>
              {form.rondaId ? (
                <Button type="button" variant="ghost" onClick={() => setForm(NUEVA)}>
                  Cancelar
                </Button>
              ) : null}
            </div>

            <p className="text-[11px] leading-relaxed text-parchment/40 sm:col-span-2">
              El <strong className="text-parchment/60">precio</strong> se puede cambiar solo
              mientras nadie haya comprado: con gente adentro, moverlo dejaría el pozo sin
              explicación —unos habrían pagado un precio y otros otro—. Vacío usa el de la
              configuración general.
            </p>
            <p className="text-[11px] leading-relaxed text-parchment/40 sm:col-span-2">
              El <strong className="text-parchment/60">tope por persona</strong> evita que
              alguien se compre la carrera entera. Importa más de lo que parece: con más del
              80% del pozo, esa persona <em>pierde plata aunque gane</em>, y una carrera donde
              uno tiene el 90% deja de ser un sorteo. Además la casa cobra más cuando el pozo
              está repartido, porque su comisión sale de la plata ajena. El tope sí se puede
              bajar con gente adentro: no toca lo ya comprado, solo impide sumar más. Cuenta
              también los caballos que regales a mano.
            </p>

            {errorForm ? (
              <p className="text-sm text-lose-glow sm:col-span-2">{errorForm}</p>
            ) : null}
          </form>
        </Panel>

        {/* ---------------------------------------------------- la pista */}
        {ronda ? (
          <section className="mt-8">
            <div className="mb-3">
              <h2 className="font-display text-lg font-semibold text-gold-light">
                En curso · #{String(ronda.ronda.numero).padStart(4, "0")} {ronda.ronda.nombre}
              </h2>
              <p className="mt-0.5 text-xs text-parchment/45">
                Pozo S/{soles(ronda.ronda.pozo_total)} · {ronda.totalTickets} caballos ·{" "}
                {ronda.participantes.length} jugadores · S/{soles(ronda.ronda.precio_ticket)} por
                caballo
              </p>
            </div>

            <PistaCarrera
              caballos={caballos}
              evento={evento}
              desfaseMs={desfase}
              reducirMovimiento={false}
            />
          </section>
        ) : null}

        {/* --------------------------------------------- lo que dejó todo */}
        {corridas.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
              Ganadores e ingresos
            </h2>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dato
                label="Entró por tickets"
                valor={`S/${soles(totales.recaudado)}`}
                detalle={`${corridas.length} ${corridas.length === 1 ? "carrera corrida" : "carreras corridas"}`}
                tono="gold"
              />
              <Dato
                label="Pagado en premios"
                valor={`S/${soles(totales.premios)}`}
                detalle="A los ganadores"
              />
              <Dato
                label="Se quedó la casa"
                valor={`S/${soles(totales.casa)}`}
                detalle="Comisión sobre lo ajeno"
                tono="win"
              />
              <Dato
                label="Caballos vendidos"
                valor={String(totales.caballos)}
                detalle={`S/${soles(totales.porCaballo)} por caballo en promedio`}
              />
            </div>

            <Panel className="mt-3 overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
                    <th className="px-3 py-2 font-semibold">Carrera</th>
                    <th className="px-3 py-2 font-semibold">Ganador</th>
                    <th className="px-3 py-2 text-right font-semibold">Entró</th>
                    <th className="px-3 py-2 text-right font-semibold">Se llevó</th>
                    <th className="px-3 py-2 text-right font-semibold">Casa</th>
                  </tr>
                </thead>
                <tbody>
                  {corridas.map(({ ronda: r, ganadorNickname, totalTickets }) => (
                    <tr key={r.id} className="border-b border-gold-dark/20 last:border-0">
                      <td className="px-3 py-2">
                        <span className="text-parchment/50">
                          #{String(r.numero).padStart(4, "0")}
                        </span>{" "}
                        <span className="text-parchment/80">{r.nombre}</span>
                        <span className="block text-[11px] text-parchment/35">
                          {totalTickets} caballos · S/{soles(r.precio_ticket)} c/u
                        </span>
                      </td>
                      <td className="px-3 py-2 font-display font-bold text-gold">
                        {ganadorNickname ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-parchment/70">
                        S/{soles(r.pozo_total)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-win-glow">
                        S/{soles(r.premio_monto ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right text-gold-light">
                        S/{soles(r.comision_monto ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gold-dark/50 font-bold text-parchment">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right">S/{soles(totales.recaudado)}</td>
                    <td className="px-3 py-2 text-right text-win-glow">
                      S/{soles(totales.premios)}
                    </td>
                    <td className="px-3 py-2 text-right text-gold-light">
                      S/{soles(totales.casa)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Panel>

            <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
              <strong className="text-parchment/60">Entró</strong> es el pozo de esa carrera:
              todo lo que pagaron los jugadores por sus caballos. De ahí sale el premio, y la
              diferencia es lo que se queda la casa — que no es el 20% del pozo sino el 20% de
              lo que pusieron los que perdieron (ver 0051).
            </p>
          </section>
        ) : null}

        {/* ------------------------------------------------- las carreras */}
        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
            Todas las carreras
          </h2>

          {rondas === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : rondas.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no has creado ninguna carrera.
            </Panel>
          ) : (
            <div className="space-y-3">
              {rondas.map(({ ronda: r, totalTickets, participantes }) => {
                const enCurso = procesando === r.id;
                const sorteada = r.ganador_ticket_id !== null;

                return (
                  <Panel
                    key={r.id}
                    className={clsx("p-5", r.estado === "abierta" && "border-win-glow/40")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-base font-semibold text-parchment">
                          #{String(r.numero).padStart(4, "0")} · {r.nombre}{" "}
                          <span
                            className={clsx(
                              "ml-1 rounded-md border px-2 py-0.5 align-middle text-[11px] font-bold",
                              r.estado === "abierta"
                                ? "border-win-glow/50 text-win-glow"
                                : "border-gold-dark text-parchment/50"
                            )}
                          >
                            {ESTADO_RONDA_LABEL[r.estado]}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-parchment/45">
                          S/{soles(r.precio_ticket)} por caballo ·{" "}
                          {r.max_tickets_por_persona === null
                            ? "sin tope"
                            : `máx. ${r.max_tickets_por_persona} por persona`}{" "}
                          · pozo S/{soles(r.pozo_total)} · {totalTickets} caballos ·{" "}
                          {participantes} jugadores
                          {sorteada
                            ? ` · premio S/${soles(r.premio_monto ?? 0)} · casa S/${soles(r.comision_monto ?? 0)}`
                            : ` · premio desde S/${soles(premioMinimo(r.pozo_total, r.porcentaje_premio))} · casa hasta S/${soles(comisionMaxima(r.pozo_total, r.porcentaje_premio))}`}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {!sorteada ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={enCurso}
                            onClick={() => editar(r)}
                            className="min-h-9 px-3 py-1 text-xs"
                          >
                            Editar
                          </Button>
                        ) : null}

                        {(r.estado === "borrador" || r.estado === "cerrada") && !sorteada ? (
                          <Button
                            type="button"
                            disabled={enCurso}
                            onClick={() =>
                              accion(
                                r.id,
                                () => cambiarEstadoRonda({ rondaId: r.id, estado: "abierta" }),
                                {
                                  title: "Carrera abierta",
                                  description: "Ya pueden comprar sus caballos.",
                                }
                              )
                            }
                            className="min-h-9 px-3 py-1 text-xs"
                          >
                            Abrir
                          </Button>
                        ) : null}

                        {r.estado === "abierta" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={enCurso}
                            onClick={() =>
                              accion(
                                r.id,
                                () => cambiarEstadoRonda({ rondaId: r.id, estado: "cerrada" }),
                                { title: "Carrera cerrada", description: "Ya no entran caballos." }
                              )
                            }
                            className="min-h-9 px-3 py-1 text-xs"
                          >
                            Cerrar
                          </Button>
                        ) : null}

                        {r.estado === "cerrada" && !sorteada ? (
                          <Button
                            type="button"
                            disabled={enCurso || totalTickets === 0}
                            onClick={() =>
                              accion(r.id, () => girarRuleta(r.id), {
                                title: "¡Largaron!",
                                description: "Todos están viendo la misma carrera.",
                              })
                            }
                            className="min-h-9 px-4 py-1 text-xs"
                          >
                            🐎 Iniciar carrera
                          </Button>
                        ) : null}

                        {r.estado === "girando" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={enCurso}
                            onClick={() =>
                              accion(r.id, () => finalizarRonda(r.id), {
                                title: "Carrera finalizada",
                              })
                            }
                            className="min-h-9 px-3 py-1 text-xs"
                          >
                            Finalizar
                          </Button>
                        ) : null}

                        {/* Cancelar devuelve el pozo. Solo antes de largar:
                            después el premio ya está acreditado. */}
                        {!sorteada && r.estado !== "cancelada" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={enCurso}
                            onClick={() => setCancelando(r)}
                            className="min-h-9 px-3 py-1 text-xs text-lose-glow"
                          >
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ------------------------------------------- confirmar cancelación */}
      {cancelando ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Cancelar la carrera ${cancelando.nombre}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCancelando(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-display text-lg font-bold text-lose-glow">
              Cancelar #{String(cancelando.numero).padStart(4, "0")} · {cancelando.nombre}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Se le devuelve a cada jugador lo que pagó por sus caballos y la carrera no se
              corre. El pozo de S/{soles(cancelando.pozo_total)} vuelve a sus dueños.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-parchment/45">
              Los caballos que regalaste a mano no se devuelven: nunca salieron del saldo de
              nadie. Los tickets quedan guardados como registro, por si alguien reclama.
            </p>

            <label
              htmlFor="motivo-cancelar"
              className="mt-4 mb-1.5 block text-sm text-parchment/80"
            >
              Motivo (opcional, queda registrado)
            </label>
            <input
              id="motivo-cancelar"
              value={motivoCancelar}
              onChange={(e) => setMotivoCancelar(e.target.value)}
              placeholder="Se cayó el stream"
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                disabled={procesando === cancelando.id}
                onClick={async () => {
                  const r = cancelando;
                  await accion(r.id, () => cancelarRonda(r.id, motivoCancelar), {
                    title: "Carrera cancelada",
                    description: "Se devolvió el pozo a los jugadores.",
                  });
                  setCancelando(null);
                  setMotivoCancelar("");
                }}
                className="flex-1"
              >
                {procesando === cancelando.id ? "Devolviendo…" : "Cancelar y devolver"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCancelando(null)}
                className="flex-1"
              >
                Volver
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Dato({
  label,
  valor,
  detalle,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  detalle?: string;
  tono?: "neutro" | "gold" | "win";
}) {
  return (
    <Panel className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p
        className={clsx(
          "mt-1 font-display text-xl font-bold",
          tono === "gold"
            ? "text-gold-light"
            : tono === "win"
              ? "text-win-glow"
              : "text-parchment"
        )}
      >
        {valor}
      </p>
      {detalle ? <p className="mt-0.5 text-[11px] text-parchment/40">{detalle}</p> : null}
    </Panel>
  );
}

export default function AdminCaballitosPage() {
  return (
    <RequireAdmin>
      <AdminCaballitosContent />
    </RequireAdmin>
  );
}
