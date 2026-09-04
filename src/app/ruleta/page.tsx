"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { RuedaRuleta } from "@/components/ruleta/RuedaRuleta";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import {
  RondaHistorial,
  VistaRuleta,
  comprarTickets,
  getHistorialRondas,
  getRuleta,
} from "@/actions/ruleta";
import {
  ESTADO_RONDA_LABEL,
  FaseGiro,
  centroDelSegmento,
  colorDeIndice,
  faseDeGiro,
  montosRapidos,
  porcentajeDeParticipacion,
  premioMinimo,
  repartoParaGanador,
  rotacionFinal,
  segmentosDeRueda,
  ticketsPorMonto,
} from "@/lib/ruleta";

/**
 * La ruleta, del lado del jugador.
 *
 * CÓMO SE MANTIENEN TODAS LAS PANTALLAS EN SINCRONÍA sin websockets: cada
 * lectura trae el `now()` de Postgres, con el que se calcula el desfase
 * contra el reloj de este navegador. La animación se dibuja en función de
 * `giro_inicia_en` —una marca del servidor— y no de cuándo llegó la noticia,
 * así que quien se entere tarde no arranca de cero: se engancha al giro donde
 * ya iba y frena en el ganador en el mismo instante que el resto.
 *
 * El ganador nunca se calcula acá. Viene elegido y pagado desde
 * `admin_girar_ruleta`; esta pantalla solo lo revela.
 */

const soles = (n: number) => n.toFixed(2);

function RuletaContent() {
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [vista, setVista] = useState<VistaRuleta | null>(null);
  const [historial, setHistorial] = useState<RondaHistorial[] | null>(null);
  const [modalCerrado, setModalCerrado] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);

  /** Reloj del servidor menos el de este navegador. Los relojes de los
   * dispositivos están sueltos; sin corregir esto el ancla no sirve. */
  const desfaseRef = useRef(0);

  const refresh = useCallback(async () => {
    const result = await getRuleta();
    if (!result.ok) {
      setErrorCarga(result.error);
      return;
    }
    setErrorCarga(null);
    desfaseRef.current = new Date(result.data.servidorAhora).getTime() - Date.now();
    setVista(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    getHistorialRondas().then((r) => setHistorial(r.ok ? r.data : []));
    // 2s: es el margen que tienen que cubrir los 3 segundos de cuenta
    // regresiva para que todos lleguen a tiempo al giro.
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
  const totalTickets = ronda?.totalTickets ?? 0;

  const segmentos = useMemo(
    () =>
      segmentosDeRueda(
        (ronda?.participantes ?? []).map((p, i) => ({
          usuarioId: p.usuarioId,
          nickname: p.nickname,
          tickets: p.tickets,
          porcentaje: porcentajeDeParticipacion(p.tickets, totalTickets),
          color: colorDeIndice(i),
        }))
      ),
    [ronda?.participantes, totalTickets]
  );

  const ganador = ronda?.ganador ?? null;
  const anguloGanador = useMemo(() => {
    if (!ganador) return null;
    const suyo = segmentos.find((s) => s.usuarioId === ganador.usuarioId);
    return suyo ? centroDelSegmento(suyo) : null;
  }, [ganador, segmentos]);

  const giroInicia = ronda?.ronda.giro_inicia_en
    ? new Date(ronda.ronda.giro_inicia_en).getTime()
    : null;

  const [animacion, setAnimacion] = useState<FaseGiro | null>(null);

  useEffect(() => {
    if (giroInicia === null || anguloGanador === null || reducirMovimiento) return;

    let frame = 0;
    const tick = () => {
      const ahoraServidor = Date.now() + desfaseRef.current;
      const fase = faseDeGiro(ahoraServidor - giroInicia, anguloGanador);
      setAnimacion(fase);
      if (fase.fase !== "terminado") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [giroInicia, anguloGanador, reducirMovimiento]);

  // Con movimiento reducido no se gira: la rueda aparece ya frenada en el
  // ganador. La información es la misma; lo que se saca es el mareo.
  const fase: FaseGiro | null =
    anguloGanador === null || giroInicia === null
      ? null
      : reducirMovimiento
        ? { fase: "terminado", rotacion: rotacionFinal(anguloGanador) }
        : animacion;

  const rotacion = fase?.rotacion ?? 0;
  const girando = fase?.fase === "cuenta" || fase?.fase === "girando";
  const revelado = fase?.fase === "terminado";

  // Desde 0051 el premio depende de CUÁNTO puso el que gana: recupera lo suyo
  // y se lleva el 80% de lo ajeno. Así que ya no hay un premio único que
  // mostrar antes de girar — se muestra el tuyo.
  const miAporte = ronda ? (vista?.misTickets ?? 0) * ronda.ronda.precio_ticket : 0;
  const premioSiGano = ronda
    ? repartoParaGanador(miAporte, ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio).premio
    : 0;

  // Solo en el giro en vivo. Una ronda ya finalizada muestra su ganador bajo
  // la rueda y en el historial: abrirle un modal a quien entra tres horas
  // después es interrumpirlo con una noticia vieja.
  const mostrarModal =
    ronda?.ganador != null &&
    revelado &&
    ronda.ronda.estado === "girando" &&
    modalCerrado !== ronda.ronda.id;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">
              La ruleta
            </h1>
            <p className="mt-2 text-sm text-parchment/60">
              Cada S/{soles(vista?.config.precio_ticket ?? 3)} es un ticket. Mientras más
              tickets tengas, más pedazo de la rueda ocupas. Si ganas,{" "}
              <span className="text-parchment/85">
                recuperas lo tuyo y te llevas el{" "}
                {vista?.ronda?.ronda.porcentaje_premio ?? 80}% de lo que pusieron los demás
              </span>
              .
            </p>
          </div>
          {ronda ? (
            <span
              className={clsx(
                "rounded-full border px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide",
                ronda.ronda.estado === "abierta"
                  ? "border-win-glow/50 bg-win/10 text-win-glow"
                  : ronda.ronda.estado === "girando"
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-gold-dark text-parchment/50"
              )}
            >
              {ronda.ronda.estado === "abierta" ? "🟢 " : ""}
              {ESTADO_RONDA_LABEL[ronda.ronda.estado]}
            </span>
          ) : null}
        </div>

        {vista === null ? (
          errorCarga ? (
            <Panel className="mt-8 border-dashed p-6 text-center">
              <p className="text-sm text-lose-glow">No se pudo cargar la ruleta.</p>
              <p className="mt-1 text-xs text-parchment/45">{errorCarga}</p>
            </Panel>
          ) : (
            <p className="mt-8 text-sm text-parchment/50">Cargando…</p>
          )
        ) : !ronda ? (
          <Panel className="mt-8 border-dashed p-8 text-center">
            <p className="font-display text-lg text-parchment/70">
              No hay ninguna ronda todavía
            </p>
            <p className="mt-1 text-sm text-parchment/45">
              Cuando el staff abra una, aparece acá y puedes comprar tus tickets.
            </p>
          </Panel>
        ) : (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metrica
                label="Pozo"
                valor={`S/${soles(ronda.ronda.pozo_total)}`}
                detalle={`Ronda #${String(ronda.ronda.numero).padStart(4, "0")}`}
                destacado
              />
              <Metrica
                label="Premio"
                valor={`S/${soles(
                  ronda.ronda.premio_monto ??
                    (vista.misTickets > 0
                      ? premioSiGano
                      : premioMinimo(ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio))
                )}`}
                detalle={
                  ronda.ronda.premio_monto !== null
                    ? "Pagado al ganador"
                    : vista.misTickets > 0
                      ? "Si ganas tú"
                      : `Lo tuyo + ${ronda.ronda.porcentaje_premio}% del resto`
                }
              />
              <Metrica label="Tickets" valor={String(ronda.totalTickets)} detalle="En juego" />
              <Metrica
                label="Participantes"
                valor={String(ronda.participantes.length)}
                detalle={vista.misTickets > 0 ? `Tienes ${vista.misTickets}` : "Todavía no entras"}
              />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <Panel className="relative overflow-hidden p-5 sm:p-7">
                <p className="text-center font-display text-sm font-bold uppercase tracking-[0.2em] text-gold-light">
                  {ronda.ronda.nombre}
                </p>
                {ronda.ronda.premio_concepto ? (
                  <p className="mt-1 text-center text-xs text-parchment/50">
                    {ronda.ronda.premio_concepto}
                  </p>
                ) : null}

                <div className="relative mt-5">
                  <RuedaRuleta
                    segmentos={segmentos}
                    rotacion={rotacion}
                    destacado={revelado ? (ronda.ganador?.usuarioId ?? null) : null}
                  />

                  {fase?.fase === "cuenta" ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span
                        key={fase.segundos}
                        className="font-display text-8xl font-black text-gold text-glow-gold"
                      >
                        {fase.segundos}
                      </span>
                    </div>
                  ) : null}
                </div>

                <p className="mt-4 text-center text-xs text-parchment/45">
                  {girando
                    ? "Girando… todos estamos viendo lo mismo."
                    : ronda.ronda.estado === "abierta"
                      ? "El staff gira la ruleta cuando cierre la ronda."
                      : ronda.ronda.estado === "cerrada"
                        ? "Ronda cerrada. El giro está por empezar."
                        : revelado && ronda.ganador
                          ? `Ganó ${ronda.ganador.nickname} con el ticket #${ronda.ganador.codigo}.`
                          : "Ronda en preparación."}
                </p>
              </Panel>

              <div className="space-y-4">
                <PanelCompra
                  rondaId={ronda.ronda.id}
                  precioTicket={ronda.ronda.precio_ticket}
                  abierta={ronda.ronda.estado === "abierta"}
                  saldo={user ? user.balance : 0}
                  misTickets={vista.misTickets}
                  showToast={showToast}
                  onComprado={async () => {
                    await Promise.all([refresh(), refreshUser()]);
                  }}
                />

                <Panel className="p-5">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wide text-gold-light">
                    Participantes
                  </h2>
                  {segmentos.length === 0 ? (
                    <p className="mt-3 text-sm text-parchment/45">
                      Nadie ha comprado tickets todavía.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {segmentos.map((s) => (
                        <li
                          key={s.usuarioId}
                          className={clsx(
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                            s.usuarioId === user?.id && "bg-gold/10"
                          )}
                        >
                          <span
                            aria-hidden
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-parchment/80">
                            {s.nickname}
                            {s.usuarioId === user?.id ? (
                              <span className="ml-1 text-xs text-gold">(tú)</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs text-parchment/45">
                            {s.tickets} · {s.porcentaje}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </section>
          </>
        )}

        <Historial rondas={historial} />
      </main>

      {mostrarModal && ronda?.ganador ? (
        <ModalGanador
          nickname={ronda.ganador.nickname}
          codigo={ronda.ganador.codigo}
          pozo={ronda.ronda.pozo_total}
          premio={ronda.ronda.premio_monto ?? 0}
          soyYo={ronda.ganador.usuarioId === user?.id}
          onCerrar={() => setModalCerrado(ronda.ronda.id)}
        />
      ) : null}
    </>
  );
}

function PanelCompra({
  rondaId,
  precioTicket,
  abierta,
  saldo,
  misTickets,
  showToast,
  onComprado,
}: {
  rondaId: string;
  precioTicket: number;
  abierta: boolean;
  saldo: number;
  misTickets: number;
  showToast: ReturnType<typeof useToast>["showToast"];
  onComprado: () => Promise<void>;
}) {
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [comprando, setComprando] = useState(false);

  const valor = Number(monto);
  const tickets = monto.trim() === "" ? null : ticketsPorMonto(valor, precioTicket);

  async function comprar(montoElegido: number) {
    setError(undefined);
    setComprando(true);
    try {
      const result = await comprarTickets({ rondaId, monto: montoElegido });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: result.data.length === 1 ? "1 ticket comprado" : `${result.data.length} tickets comprados`,
        description: `Ya estás en la rueda por S/${soles(montoElegido)}.`,
      });
      setMonto("");
      await onComprado();
    } finally {
      setComprando(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tickets === null) {
      setError(`El monto tiene que ser múltiplo de S/${soles(precioTicket)}.`);
      return;
    }
    void comprar(valor);
  }

  return (
    <Panel className="p-5">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-gold-light">
        Comprar tickets
      </h2>

      {!abierta ? (
        <p className="mt-3 text-sm text-parchment/45">
          La ronda no está abierta. Espera a la siguiente para entrar.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {montosRapidos(precioTicket).map((m) => (
              <button
                key={m}
                type="button"
                disabled={comprando || m > saldo}
                onClick={() => void comprar(m)}
                className="min-h-11 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-2 text-center transition hover:border-gold/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="block font-display text-sm font-extrabold text-parchment">
                  S/{soles(m)}
                </span>
                <span className="block text-[10px] text-parchment/45">
                  {ticketsPorMonto(m, precioTicket)} tickets
                </span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-3">
            <label
              htmlFor="monto-ruleta"
              className="text-[11px] uppercase tracking-wide text-parchment/40"
            >
              Otro monto (múltiplo de S/{soles(precioTicket)})
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="monto-ruleta"
                type="number"
                inputMode="decimal"
                min={precioTicket}
                step={precioTicket}
                value={monto}
                onChange={(e) => {
                  setMonto(e.target.value);
                  setError(undefined);
                }}
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                placeholder={soles(precioTicket * 3)}
              />
              <Button
                type="submit"
                disabled={comprando || monto.trim() === ""}
                className="shrink-0 px-4 text-xs"
              >
                {comprando ? "…" : "Comprar"}
              </Button>
            </div>
            {tickets !== null ? (
              <p className="mt-2 text-xs text-win-glow">
                Son {tickets} {tickets === 1 ? "ticket" : "tickets"}.
              </p>
            ) : null}
          </form>

          {error ? <p className="mt-3 text-sm text-lose-glow">{error}</p> : null}
        </>
      )}

      <p className="mt-4 border-t border-gold-dark/40 pt-3 text-xs text-parchment/45">
        Tu saldo: <span className="text-parchment/80">S/{soles(saldo)}</span>
        {misTickets > 0 ? ` · Tus tickets: ${misTickets}` : null}
      </p>
    </Panel>
  );
}

function ModalGanador({
  nickname,
  codigo,
  pozo,
  premio,
  soyYo,
  onCerrar,
}: {
  nickname: string;
  codigo: string;
  pozo: number;
  premio: number;
  soyYo: boolean;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const cerrarConEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", cerrarConEscape);
    return () => window.removeEventListener("keydown", cerrarConEscape);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ganador"
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/85 p-4 backdrop-blur-sm"
    >
      <Panel className="w-full max-w-sm p-7 text-center">
        <p id="titulo-ganador" className="font-display text-lg font-bold text-gold">
          🏆 ¡Tenemos ganador!
        </p>
        <p className="mt-4 font-display text-3xl font-black text-parchment">{nickname}</p>
        {soyYo ? (
          <p className="mt-1 font-display text-sm font-bold uppercase tracking-wide text-win-glow">
            ¡Ganaste tú!
          </p>
        ) : null}
        <p className="mt-3 text-xs text-parchment/50">
          Ticket ganador <span className="text-parchment/80">#{codigo}</span>
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-gold-dark/40 pt-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-parchment/40">Pozo</p>
            <p className="font-display text-lg font-bold text-parchment">S/{soles(pozo)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-parchment/40">Premio</p>
            <p className="font-display text-lg font-bold text-gold">S/{soles(premio)}</p>
          </div>
        </div>

        <Button type="button" onClick={onCerrar} className="mt-6 w-full">
          Cerrar
        </Button>
      </Panel>
    </div>
  );
}

function Historial({ rondas }: { rondas: RondaHistorial[] | null }) {
  if (rondas === null || rondas.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
        Rondas anteriores
      </h2>
      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-gold-dark/40 text-left text-[11px] uppercase tracking-wide text-parchment/40">
              <th className="px-3 py-2 font-semibold">Ronda</th>
              <th className="px-3 py-2 text-right font-semibold">Pozo</th>
              <th className="px-3 py-2 text-right font-semibold">Tickets</th>
              <th className="px-3 py-2 text-right font-semibold">Jugadores</th>
              <th className="px-3 py-2 font-semibold">Ganador</th>
              <th className="px-3 py-2 text-right font-semibold">Premio</th>
            </tr>
          </thead>
          <tbody>
            {rondas.map(({ ronda, ganadorNickname, totalTickets, participantes }) => (
              <tr key={ronda.id} className="border-b border-gold-dark/20 last:border-0">
                <td className="px-3 py-2 text-parchment/80">
                  #{String(ronda.numero).padStart(4, "0")}
                  <span className="ml-2 text-xs text-parchment/40">{ronda.nombre}</span>
                </td>
                <td className="px-3 py-2 text-right text-parchment/70">
                  S/{soles(ronda.pozo_total)}
                </td>
                <td className="px-3 py-2 text-right text-parchment/60">{totalTickets}</td>
                <td className="px-3 py-2 text-right text-parchment/60">{participantes}</td>
                <td className="px-3 py-2 text-parchment/80">{ganadorNickname ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-gold-light">
                  S/{soles(ronda.premio_monto ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

function Metrica({
  label,
  valor,
  detalle,
  destacado = false,
}: {
  label: string;
  valor: string;
  detalle: string;
  destacado?: boolean;
}) {
  return (
    <Panel className={clsx("p-4", destacado && "border-gold-light/50 bg-gold/5")}>
      <p className="text-[11px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p
        className={clsx(
          "mt-1 font-display text-2xl font-bold",
          destacado ? "text-gold-light" : "text-parchment"
        )}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-parchment/40">{detalle}</p>
    </Panel>
  );
}

export default function RuletaPage() {
  return (
    <RequirePlayer>
      <RuletaContent />
    </RequirePlayer>
  );
}
