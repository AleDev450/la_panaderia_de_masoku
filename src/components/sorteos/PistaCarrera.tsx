"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { CarreraSorteo } from "@/lib/supabase/types";
import {
  DURACION_CARRERA_MS,
  DURACION_CORRAN_MS,
  InscripcionCarrera,
  caballosEnPista,
  colorDePersona,
  faseDeCarrera,
  idDeCaballo,
  ordenEnCajon,
  perfilesDeCarrera,
  posicionCaballo,
  puestosActuales,
} from "@/lib/carrera";

/**
 * La pista: un caballo por ticket, corriendo hacia un ganador que Postgres ya
 * eligió y guardó (0056).
 *
 * LA POSICIÓN SE ESCRIBE DIRECTO EN EL DOM, sin pasar por el estado de React.
 * Con 32 carriles a 60fps, un `setState` por frame haría re-renderizar 32
 * filas sesenta veces por segundo y la carrera iría a tirones — que es
 * justamente lo que no puede pasar en lo único que la gente va a mirar.
 * Solo el rótulo de estado usa estado, y cambia un puñado de veces.
 */

export function PistaCarrera({
  inscripciones,
  carrera,
  desfaseMs,
  miUsuarioId,
  reducirMovimiento,
}: {
  inscripciones: (InscripcionCarrera & { ganador: boolean })[];
  carrera: CarreraSorteo | null;
  /** Reloj del servidor menos el de este navegador. */
  desfaseMs: number;
  miUsuarioId?: string;
  reducirMovimiento: boolean;
}) {
  const [fase, setFase] = useState<"cajon" | "cuenta" | "largando" | "corriendo" | "terminada">(
    "cajon"
  );
  const [cuenta, setCuenta] = useState(0);
  const marcasRef = useRef(new Map<string, HTMLDivElement | null>());
  const puestosRef = useRef(new Map<string, HTMLSpanElement | null>());
  const [expandido, setExpandido] = useState(false);

  // Salir con Escape, y trabar el scroll del fondo mientras la pista ocupa la
  // pantalla: si no, rueda la página de atrás y al cerrar quedas en otro lado.
  useEffect(() => {
    if (!expandido) return;

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandido(false);
    };
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", alTeclear);

    return () => {
      document.body.style.overflow = overflowPrevio;
      document.removeEventListener("keydown", alTeclear);
    };
  }, [expandido]);

  /**
   * QUIEN YA GANÓ NO VUELVE A CORRER.
   *
   * El sorteo lo excluye en Postgres (`and not ganador`), así que dejar sus
   * caballos en la pista sería mostrar corredores que no pueden ganar: se
   * verían punteando a mitad de carrera y perdiendo siempre, sin explicación.
   *
   * La excepción es el ganador de LA carrera que se está mostrando: mientras
   * se ve su llegada todavía tiene que estar en la pista, o desaparecería
   * justo el caballo que acaba de cruzar primero.
   */
  const caballos = useMemo(
    () => caballosEnPista(inscripciones, carrera?.inscripcion_ganadora_id ?? null),
    [inscripciones, carrera]
  );

  const sinTickets = inscripciones.filter((i) => i.tickets === 0);
  const yaGanaron = inscripciones.filter(
    (i) => i.ganador && i.inscripcionId !== carrera?.inscripcion_ganadora_id
  );

  const ganadorId = carrera
    ? idDeCaballo(carrera.inscripcion_ganadora_id, carrera.caballo_numero)
    : null;

  const perfiles = useMemo(() => {
    if (!carrera || !ganadorId) return null;
    return perfilesDeCarrera(carrera.semilla, caballos, ganadorId);
  }, [carrera, ganadorId, caballos]);

  // Los carriles se fijan una vez y no se reordenan durante la carrera: con 32
  // filas saltando de lugar, seguir a un caballo con la vista es imposible.
  //
  // Sin carrera todavía, los caballos igual se muestran BARAJADOS: agrupados
  // por dueño la pista parece una planilla, no una partida.
  const enOrden = useMemo(() => {
    if (!perfiles) return ordenEnCajon(caballos).map((caballo, i) => ({ caballo, carril: i }));
    return [...perfiles].sort((a, b) => a.carril - b.carril);
  }, [perfiles, caballos]);

  useEffect(() => {
    // Sin carrera no hay nada que animar. No hace falta tocar el estado acá:
    // `faseVisible` ya devuelve "cajón" mientras `carrera` sea null.
    if (!carrera || !perfiles) return;

    const inicio = new Date(carrera.inicia_en).getTime();

    // Con movimiento reducido no se anima: los caballos aparecen ya en la
    // meta. El rótulo lo resuelve `faseVisible`, así que acá solo se colocan.
    if (reducirMovimiento) {
      const puestos = puestosActuales(perfiles, 1);
      for (const p of perfiles) {
        const el = marcasRef.current.get(p.caballo.id);
        if (el) el.style.left = `${posicionCaballo(p, 1) * 100}%`;

        const puesto = puestosRef.current.get(p.caballo.id);
        if (puesto) puesto.textContent = `${puestos.get(p.caballo.id) ?? "-"}°`;
      }
      return;
    }

    let frame = 0;
    const tick = () => {
      const transcurrido = Date.now() + desfaseMs - inicio;
      const f = faseDeCarrera(transcurrido);

      // Posición y puesto se escriben al DOM: son 64 nodos cambiando 60 veces
      // por segundo, y pasarlos por el estado de React haría la carrera a
      // tirones.
      const puestos = puestosActuales(perfiles, f.t);
      for (const p of perfiles) {
        const el = marcasRef.current.get(p.caballo.id);
        if (el) el.style.left = `${posicionCaballo(p, f.t) * 100}%`;

        const puesto = puestosRef.current.get(p.caballo.id);
        if (puesto) puesto.textContent = `${puestos.get(p.caballo.id) ?? "-"}°`;
      }

      setFase(
        f.fase === "cuenta"
          ? "cuenta"
          : f.fase === "terminada"
            ? "terminada"
            : transcurrido < DURACION_CORRAN_MS
              ? "largando"
              : "corriendo"
      );
      if (f.fase === "cuenta") setCuenta(f.segundos);

      if (f.fase !== "terminada") frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [carrera, perfiles, desfaseMs, reducirMovimiento]);

  const ganador = caballos.find((c) => c.id === ganadorId);
  // Sin carrera, los caballos están en el cajón sin importar en qué quedó una
  // carrera anterior; con movimiento reducido nunca se anima, así que la
  // carrera se muestra siempre como ya corrida.
  const faseVisible = !carrera ? "cajon" : reducirMovimiento ? "terminada" : fase;

  return (
    <div
      className={clsx(
        expandido &&
          "fixed inset-0 z-50 flex flex-col overflow-hidden bg-obsidian p-3 sm:p-5"
      )}
    >
      {/* ------------------------------------------------------- estado */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className={clsx(
              "font-display font-semibold text-gold-light",
              expandido ? "text-2xl" : "text-lg"
            )}
          >
            🐎 Carrera de caballitos
          </h2>
          <p className="mt-0.5 text-xs text-parchment/45">
            {caballos.length} caballos · un caballo por ticket, todos con la misma chance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            aria-live="polite"
            className={clsx(
              "rounded-full border px-3 py-1 font-display font-black uppercase tracking-wide",
              expandido ? "text-sm" : "text-xs",
              faseVisible === "corriendo"
                ? "border-gold bg-gold/15 text-gold"
                : faseVisible === "terminada"
                  ? "border-win-glow/60 bg-win/10 text-win-glow"
                  : "border-gold-dark text-parchment/50"
            )}
          >
            {faseVisible === "cajon"
              ? "En el cajón"
              : faseVisible === "cuenta"
                ? `Largan en ${cuenta}…`
                : faseVisible === "largando"
                  ? "¡Corran!"
                  : faseVisible === "corriendo"
                    ? "¡Corriendo!"
                    : "Llegaron"}
          </span>

          {/* Con 32 carriles la vista normal obliga a scrollear justo cuando
              hay que mirar. Acá se reparte la altura de la pantalla entre
              todos para que entren de una. */}
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            aria-label={expandido ? "Salir de pantalla completa" : "Ver en pantalla completa"}
            className="min-h-9 shrink-0 rounded-md border border-gold-dark px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-parchment/70 transition hover:border-gold hover:text-gold"
          >
            {expandido ? "✕ Salir" : "⛶ Pantalla completa"}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------ ganador */}
      {faseVisible === "terminada" && ganador ? (
        <Panel className="mb-3 shrink-0 border-win-glow/50 bg-win/5 p-4 text-center">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-win-glow">
            🏆 Tenemos ganador
          </p>
          <p className="mt-1 font-display text-2xl font-black text-parchment">
            {ganador.etiqueta}
          </p>
          <p className="mt-0.5 text-xs text-parchment/50">
            Ganó {ganador.nickname}
            {miUsuarioId === ganador.usuarioId ? " — ¡eres tú!" : ""}
          </p>
        </Panel>
      ) : null}

      {/* -------------------------------------------------------- pista */}
      <Panel
        className={clsx(
          "relative overflow-hidden p-0",
          // `min-h-0` es lo que deja que un hijo con scroll se encoja dentro
          // de un flex; sin eso la pista se pasa del alto de la pantalla.
          expandido && "min-h-0 flex-1"
        )}
      >
        {/* La cuenta va ENCIMA de la pista y no en un rincón: es el momento
            en el que todos miran lo mismo. */}
        {faseVisible === "cuenta" || faseVisible === "largando" ? (
          <div
            aria-live="assertive"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-obsidian/70 backdrop-blur-[2px]"
          >
            <span
              className={clsx(
                "font-display font-black uppercase text-glow-gold",
                faseVisible === "largando"
                  ? "text-5xl text-win-glow sm:text-7xl"
                  : "text-7xl text-gold sm:text-9xl"
              )}
            >
              {faseVisible === "largando" ? "¡Corran!" : cuenta}
            </span>
          </div>
        ) : null}

        <div
          className={clsx(
            "overflow-y-auto",
            expandido ? "flex h-full flex-col" : "max-h-[30rem]"
          )}
        >
          {enOrden.map((fila) => {
            const c = fila.caballo;
            const mio = c.usuarioId === miUsuarioId;
            const esGanador = faseVisible === "terminada" && c.id === ganadorId;
            const color = colorDePersona(c.usuarioId);

            return (
              <div
                key={c.id}
                className={clsx(
                  "flex items-center gap-2 border-b border-gold-dark/20 px-2 last:border-0",
                  // Expandido: los carriles se reparten el alto disponible, con
                  // un piso para que no se aplasten si la pantalla es chica.
                  expandido ? "min-h-[22px] flex-1 py-0.5" : "py-1",
                  esGanador && "bg-win/10",
                  mio && !esGanador && "bg-gold/5"
                )}
              >
                {/* El puesto en vivo: es lo que deja seguir al caballo propio
                    entre 32 sin medir barras con el ojo. */}
                <span
                  ref={(el) => {
                    puestosRef.current.set(c.id, el);
                  }}
                  className={clsx(
                    "shrink-0 text-right font-display font-black tabular-nums",
                    expandido ? "w-9 text-sm" : "w-7 text-[11px]",
                    esGanador ? "text-win-glow" : mio ? "text-gold" : "text-parchment/35"
                  )}
                >
                  —
                </span>

                <span
                  className={clsx(
                    "shrink-0 truncate font-semibold",
                    expandido ? "w-32 text-xs sm:w-44 sm:text-sm" : "w-24 text-[11px] sm:w-32",
                    esGanador ? "text-win-glow" : mio ? "text-gold" : "text-parchment/60"
                  )}
                  style={!esGanador && !mio ? { color } : undefined}
                >
                  {c.etiqueta}
                </span>

                {/* El carril. La meta es el borde derecho. */}
                <div
                  className={clsx(
                    "relative flex-1 rounded-full bg-obsidian/70 ring-1 ring-gold-dark/40",
                    expandido ? "h-full min-h-[18px]" : "h-5"
                  )}
                >
                  <div
                    ref={(el) => {
                      marcasRef.current.set(c.id, el);
                    }}
                    className={clsx(
                      "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 leading-none",
                      expandido ? "text-base sm:text-lg" : "text-sm"
                    )}
                    style={{ left: "0%" }}
                  >
                    <span aria-hidden>🐎</span>
                  </div>
                  <span
                    aria-hidden
                    className="absolute right-0 top-0 h-full w-0.5 rounded-full bg-gold/50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ------------------------------------------------------- las notas */}
      {/* En pantalla completa no se muestran: cada línea acá abajo es alto que
          se le quita a los carriles, que es lo que se vino a ver. */}
      {!expandido ? (
        <>
          {yaGanaron.length > 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
              <strong className="text-win-glow/80">Ya ganaron</strong> y salieron de la pista:{" "}
              {yaGanaron.map((i) => i.nickname).join(", ")}. Un premio por persona.
            </p>
          ) : null}

          {sinTickets.length > 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-parchment/40">
              <strong className="text-parchment/60">Inscritos sin tickets</strong> (no corren):{" "}
              {sinTickets.map((i) => i.nickname).join(", ")}. Para participar hace falta al
              menos un ticket.
            </p>
          ) : null}

          <p className="mt-1 text-[11px] leading-relaxed text-parchment/40">
            Cada ticket es un caballo, así que tener 4 tickets es correr con 4 caballos — y
            cada caballo de la pista tiene exactamente la misma chance que cualquier otro. El
            ganador lo decide el servidor antes de la largada: todos ven la misma carrera.
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Cuánto dura, para que la pantalla que la usa sepa cuándo refrescar. */
export const DURACION_TOTAL_CARRERA_MS = DURACION_CARRERA_MS;
