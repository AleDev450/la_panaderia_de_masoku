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
  crearRondaLibre,
  getHistorialRondas,
  getRuleta,
  girarLibre,
} from "@/actions/ruleta";
import { CachudobetConfig } from "@/lib/supabase/types";
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
  tiempoRestante,
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
  /** Id de la ruleta que se está mirando, cuando hay varias abiertas. */
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  /** Reloj propio para la cuenta atrás de las ruletas libres: leer Date.now()
   * en el render sería impuro y no volvería a pintar solo. */
  const [ahora, setAhora] = useState(() => Date.now());
  /** El mismo desfase que `desfaseRef`, pero en estado: la animación lo lee en
   * un rAF (ref) y la cuenta atrás en el render, y un ref no se puede leer
   * mientras se pinta. */
  const [desfase, setDesfase] = useState(0);

  /** Reloj del servidor menos el de este navegador. Los relojes de los
   * dispositivos están sueltos; sin corregir esto el ancla no sirve. */
  const desfaseRef = useRef(0);

  /**
   * Ruletas libres que ya mandamos a girar, para no llamar en cada poll.
   * El RPC aguanta llamadas repetidas —devuelve la ronda ya girada en vez de
   * fallar— pero no tiene sentido pedirle lo mismo cada dos segundos.
   */
  const disparadas = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const result = await getRuleta();
    if (!result.ok) {
      setErrorCarga(result.error);
      return;
    }
    setErrorCarga(null);
    const nuevoDesfase = new Date(result.data.servidorAhora).getTime() - Date.now();
    desfaseRef.current = nuevoDesfase;
    setDesfase(nuevoDesfase);
    setVista(result.data);

    /**
     * EL RELOJ DE LA RULETA LIBRE LO MIRA EL CLIENTE.
     *
     * El proyecto no tiene tareas programadas, así que quien tenga la pantalla
     * abierta y vea la hora vencida es el que dispara el giro — el mismo
     * patrón que el pago automático de eventos. Postgres no confía en esto:
     * `girar_ruleta_libre` no gira antes de tiempo ni dos veces.
     *
     * El error se ignora a propósito: es una tarea de fondo, y molestar al
     * jugador con un toast por algo que él no pidió sería ruido.
     */
    const ahoraServidor = Date.now() + desfaseRef.current;
    for (const r of result.data.rondas) {
      const { id, modo, gira_en, ganador_ticket_id } = r.ronda;
      if (modo !== "libre" || ganador_ticket_id !== null || !gira_en) continue;
      if (new Date(gira_en).getTime() > ahoraServidor) continue;
      if (disparadas.current.has(id)) continue;

      disparadas.current.add(id);
      // No se refresca acá a propósito: el poll de 2 segundos trae el
      // resultado igual, y llamar a `refresh` desde dentro de sí mismo pide
      // un ref que después hay que leer en el render.
      void girarLibre(id);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // Solo ruletas: sin el filtro, acá aparecían carreras de caballitos.
    getHistorialRondas(["ruleta", "libre"]).then((r) => setHistorial(r.ok ? r.data : []));
    // 2s: es el margen que tienen que cubrir los 3 segundos de cuenta
    // regresiva para que todos lleguen a tiempo al giro.
    const id = setInterval(refresh, 2_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    setReducirMovimiento(mq.matches);
    const escuchar = (e: MediaQueryListEvent) => setReducirMovimiento(e.matches);
    mq.addEventListener("change", escuchar);
    return () => mq.removeEventListener("change", escuchar);
  }, []);

  // Cuál de las ruletas vivas se está mirando. La selección es del cliente:
  // el servidor manda todas y acá se elige. Si la elegida desaparece —el staff
  // la finalizó— se cae sola a la primera en vez de dejar la pantalla vacía.
  const rondas = vista?.rondas ?? [];
  const ronda =
    rondas.find((r) => r.ronda.id === seleccionada) ?? vista?.ronda ?? null;
  const totalTickets = ronda?.totalTickets ?? 0;

  // Por ronda, no global: cada ruleta tiene sus propios tickets.
  const misTickets =
    ronda?.participantes.find((p) => p.usuarioId === user?.id)?.tickets ?? 0;

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
  const miAporte = ronda ? misTickets * ronda.ronda.precio_ticket : 0;
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
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

        {/* 80 / 20. La izquierda lleva todo el juego —abrir ruleta, la rueda,
            comprar—; la derecha solo la lista de ganadores, que arranca a la
            misma altura que el formulario. Debajo de xl se apila, que es lo
            único que funciona en un teléfono. */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">
            {/* Abrir una ruleta va ARRIBA: estaba al final de la página, así
                que había que scrollear hasta el fondo para encontrar la única
                acción que un jugador puede iniciar solo. */}
            <FormularioLibre
              config={vista?.config ?? null}
              saldo={user?.balance ?? 0}
              yaTengo={rondas.some(
                (r) => r.ronda.modo === "libre" && r.ronda.admin_id === user?.id
              )}
              onCreada={async () => {
                await Promise.all([refresh(), refreshUser()]);
              }}
              showToast={showToast}
            />

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
            {/* Solo aparece si de verdad hay varias: con una sola, una fila de
                pestañas de un elemento es ruido. */}
            {rondas.length > 1 ? (
              <section className="mt-6">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-parchment/40">
                  {rondas.length} ruletas activas — elige una
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rondas.map((r) => {
                    const activa = r.ronda.id === ronda.ronda.id;
                    const mios =
                      r.participantes.find((p) => p.usuarioId === user?.id)?.tickets ?? 0;
                    const abierta = r.ronda.estado === "abierta";
                    return (
                      <button
                        key={r.ronda.id}
                        type="button"
                        aria-pressed={activa}
                        onClick={() => setSeleccionada(r.ronda.id)}
                        className={clsx(
                          "rounded-xl border p-4 text-left transition",
                          activa
                            ? "border-gold bg-gold/10 shadow-[0_0_24px_-10px_rgba(245,197,24,0.8)]"
                            : "border-gold-dark bg-charcoal/60 hover:border-gold/60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          {/* Qué clase de ruleta es: la semanal la gira el
                              staff, la libre gira sola. */}
                          <span
                            className={clsx(
                              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                              r.ronda.modo === "libre"
                                ? "border-win-glow/50 text-win-glow"
                                : "border-gold/50 text-gold"
                            )}
                          >
                            {r.ronda.modo === "libre" ? "Libre" : "Semanal"}
                          </span>
                          <span className="shrink-0 font-display text-[10px] font-bold uppercase tracking-wider text-parchment/40">
                            #{String(r.ronda.numero).padStart(4, "0")}
                          </span>
                        </div>

                        {/* El nombre es lo que la identifica: por eso va grande
                            y no como un pie de foto. */}
                        <p
                          className={clsx(
                            "mt-1.5 font-display text-lg leading-tight font-bold break-words",
                            activa ? "text-gold" : "text-parchment"
                          )}
                        >
                          {r.ronda.nombre}
                        </p>

                        <p className="mt-2 font-display text-2xl font-black text-gold-light">
                          S/{soles(r.ronda.pozo_total)}
                          <span className="ml-1 text-[11px] font-normal text-parchment/40">
                            de pozo
                          </span>
                        </p>

                        {/* Saber si ya estás dentro es la pregunta que uno se
                            hace mirando varias ruletas a la vez. */}
                        <p
                          className={clsx(
                            "mt-2 text-xs font-semibold",
                            mios > 0 ? "text-win-glow" : "text-parchment/45"
                          )}
                        >
                          {mios > 0
                            ? `✓ Participas con ${mios} ${mios === 1 ? "ticket" : "tickets"}`
                            : abierta
                              ? "Todavía no participas"
                              : "No alcanzaste a entrar"}
                        </p>

                        {/* El reloj de la libre. Sin segundo jugador todavía no
                            corre, y decirlo evita que parezca colgada. */}
                        {r.ronda.modo === "libre" ? (
                          <p className="mt-1.5 font-display text-xs font-bold text-gold-light">
                            {tiempoRestante(r.ronda.gira_en, ahora + desfase)
                              ? `⏱ Gira en ${tiempoRestante(r.ronda.gira_en, ahora + desfase)}`
                              : `Esperando un jugador más para arrancar el reloj`}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-[11px] text-parchment/40">
                            La gira el staff
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

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
                    (misTickets > 0
                      ? premioSiGano
                      : premioMinimo(ronda.ronda.pozo_total, ronda.ronda.porcentaje_premio))
                )}`}
                detalle={
                  ronda.ronda.premio_monto !== null
                    ? "Pagado al ganador"
                    : misTickets > 0
                      ? "Si ganas tú"
                      : `Lo tuyo + ${ronda.ronda.porcentaje_premio}% del resto`
                }
              />
              <Metrica label="Tickets" valor={String(ronda.totalTickets)} detalle="En juego" />
              <Metrica
                label="Participantes"
                valor={String(ronda.participantes.length)}
                detalle={misTickets > 0 ? `Tienes ${misTickets}` : "Todavía no entras"}
              />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <Panel className="relative overflow-hidden p-5 sm:p-7">
                {/* Qué ruleta es y si está abierta, sobre la rueda misma.
                    El nombre lo escribe quien la crea, así que no sirve para
                    saber de qué tipo es: una libre puede llamarse "Ruleta
                    semanal" y una del staff, cualquier cosa. */}
                <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
                  <span
                    className={clsx(
                      "rounded-full border px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-wider",
                      ronda.ronda.modo === "libre"
                        ? "border-win-glow/50 bg-win/10 text-win-glow"
                        : "border-gold/50 bg-gold/10 text-gold"
                    )}
                  >
                    {ronda.ronda.modo === "libre" ? "🎲 Ruleta libre" : "⭐ Ruleta semanal"}
                  </span>

                  <span
                    className={clsx(
                      "rounded-full border px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-wider",
                      ronda.ronda.estado === "abierta"
                        ? "border-win-glow/50 text-win-glow"
                        : "border-gold-dark text-parchment/50"
                    )}
                  >
                    {ronda.ronda.estado === "abierta"
                      ? "🟢 Abierta"
                      : ESTADO_RONDA_LABEL[ronda.ronda.estado]}
                  </span>

                  {/* La libre además dice cuánto le queda: es lo que decide si
                      todavía te da tiempo de entrar. */}
                  {ronda.ronda.modo === "libre" ? (
                    <span className="rounded-full border border-gold-dark px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-wider text-gold-light">
                      {tiempoRestante(ronda.ronda.gira_en, ahora + desfase)
                        ? `⏱ ${tiempoRestante(ronda.ronda.gira_en, ahora + desfase)}`
                        : "Falta un jugador"}
                    </span>
                  ) : null}
                </div>

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
                  misTickets={misTickets}
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
          </div>

          {/* `top-24` y no `top-6`: la barra de arriba está fija y mide unos
              72px, así que con 24 la caja se metía DEBAJO del header al
              scrollear y los ganadores desaparecían. `mt-12` la baja para que
              arranque por debajo del título "Abre tu propia ruleta" en vez de
              por encima. */}
          <aside className="xl:sticky xl:top-24 xl:mt-10 xl:self-start">
            <Historial rondas={historial} miUsuarioId={user?.id} />
          </aside>
        </div>
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

/**
 * Abrir una ruleta libre.
 *
 * El precio del ticket lo pone quien la crea, y entra de una con sus propios
 * tickets — no existe una ruleta libre sin su creador adentro. La cuenta atrás
 * no arranca acá: espera al segundo jugador, porque una ruleta de una sola
 * persona no tiene contra quién sortear.
 */
function FormularioLibre({
  config,
  saldo,
  yaTengo,
  onCreada,
  showToast,
}: {
  config: CachudobetConfig | null;
  saldo: number;
  /** Solo se permite una ruleta libre abierta por persona. */
  yaTengo: boolean;
  onCreada: () => Promise<void>;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("3");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const precioNum = Number(precio);
  // Abrirla cuesta exactamente un ticket: el creador entra con uno.
  const cuesta = Number.isFinite(precioNum) ? Math.round(precioNum * 100) / 100 : 0;

  async function handleCrear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (cuesta < 1) {
      setError("El ticket tiene que costar al menos S/1.");
      return;
    }
    if (cuesta > saldo) {
      setError(`No te alcanza: necesitas S/${soles(cuesta)} y tienes S/${soles(saldo)}.`);
      return;
    }

    setCreando(true);
    try {
      const result = await crearRondaLibre({
        nombre,
        precioTicket: precioNum,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: "Tu ruleta está abierta",
        description: "Cuando entre otro jugador arranca la cuenta atrás.",
      });
      setNombre("");
      await onCreada();
    } finally {
      setCreando(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
        Abre tu propia ruleta
      </h2>

      {yaTengo ? (
        <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
          Ya tienes una ruleta libre abierta. Cuando termine podrás abrir otra.
        </Panel>
      ) : (
        <Panel className="p-5">
          <form onSubmit={handleCrear} className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wide text-parchment/40">
                Nombre
              </span>
              <input
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  setError(null);
                }}
                placeholder="La ruleta de los valientes"
                maxLength={80}
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-parchment/40">
                Precio por ticket (mínimo S/1)
              </span>
              <input
                type="number"
                min={1}
                max={100}
                step="0.5"
                value={precio}
                onChange={(e) => {
                  setPrecio(e.target.value);
                  setError(null);
                }}
                className="mt-1 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
            </label>

            <div className="flex items-end">
              <Button type="submit" disabled={creando || nombre.trim().length < 3}>
                {creando ? "Abriendo…" : `Abrir por S/${soles(cuesta)}`}
              </Button>
            </div>

            <p className="text-[11px] leading-relaxed text-parchment/40 sm:col-span-2">
              Abrirla te cuesta <strong className="text-parchment/60">un ticket</strong>: entras
              de una, porque no existe una ruleta libre sin su creador adentro. Si quieres más,
              los compras después como cualquiera —{" "}
              <strong className="text-parchment/60">no hay tope de tickets</strong>. Cuando
              llegue el jugador nº {config?.libre_min_jugadores ?? 2} arranca una cuenta de{" "}
              <strong className="text-parchment/60">{config?.libre_minutos ?? 10} minutos</strong>{" "}
              y al terminar gira y paga sola. Con una sola persona no arranca: no habría contra
              quién sortear.
            </p>

            {error ? <p className="text-sm text-lose-glow sm:col-span-2">{error}</p> : null}
          </form>
        </Panel>
      )}
    </section>
  );
}

/**
 * Las últimas 10 rondas, al costado.
 *
 * Solo ganador y premio: era una tabla de seis columnas —pozo, tickets,
 * jugadores…— que en una columna angosta obligaba a scrollear de lado para
 * leer justamente los dos datos que importan. El resto de las cifras las
 * tiene el panel del staff, que es quien las necesita.
 */
function Historial({
  rondas,
  miUsuarioId,
}: {
  rondas: RondaHistorial[] | null;
  miUsuarioId?: string;
}) {
  if (rondas === null || rondas.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
        Últimos ganadores
      </h2>
      {/* Lista vertical: la columna es angosta (20%), así que cada ronda va en
          dos renglones —nombre arriba, ronda debajo— con el premio al costado.
          Una tabla acá obligaría a scrollear de lado. */}
      <Panel className="p-0">
        <ul>
          {rondas.slice(0, 10).map(({ ronda, ganadorNickname }) => {
            const mio = ronda.ganador_usuario_id === miUsuarioId;
            return (
              <li
                key={ronda.id}
                className={clsx(
                  "border-b border-gold-dark/20 px-3 py-2.5 last:border-0",
                  mio && "bg-win/5"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={clsx(
                      "min-w-0 truncate font-display text-sm font-bold",
                      mio ? "text-win-glow" : "text-parchment/85"
                    )}
                  >
                    {ganadorNickname ?? "—"}
                    {mio ? " (tú)" : ""}
                  </p>
                  <span className="shrink-0 font-display text-sm font-bold text-gold-light">
                    S/{soles(ronda.premio_monto ?? 0)}
                  </span>
                </div>
                <p className="truncate text-[11px] text-parchment/40">
                  #{String(ronda.numero).padStart(4, "0")} · {ronda.nombre}
                </p>
              </li>
            );
          })}
        </ul>
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
