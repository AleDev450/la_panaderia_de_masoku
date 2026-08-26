"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import {
  EventoResumen,
  LadoResumen,
  crearEvento,
  getEventosHoy,
  getEventosPorFecha,
} from "@/actions/betting";
import {
  cambiarEstadoEvento,
  cancelarEvento,
  confirmarPago,
  corregirResultado,
  declararResultado,
  eliminarEventoPrueba,
  liquidarVencidos,
  reiniciarTurnos,
  servirCarta,
} from "@/actions/admin";
import { ResolverPanel } from "@/components/bakery/ResolverPanel";
import { CategoriaBadge, CATEGORIA_OPTIONS } from "@/components/partidas/CategoriaBadge";
import { CategoriaEvento, EstadoTurno, Evento } from "@/lib/supabase/types";
import { DURACION_MIN_DEFAULT } from "@/types";
import { HERRAMIENTAS_PRUEBA } from "@/lib/flags";
import { hoyIsoEnPeru } from "@/lib/eventos";

function AdminTitulosContent() {
  const { showToast } = useToast();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const [minutosExtra, setMinutosExtra] = useState<Record<string, string>>({});
  const [eliminandoEvento, setEliminandoEvento] = useState<Evento | null>(null);
  const [eliminandoProcesando, setEliminandoProcesando] = useState(false);
  const [cancelandoEvento, setCancelandoEvento] = useState<Evento | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [cancelandoProcesando, setCancelandoProcesando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [ladoA, setLadoA] = useState("");
  const [ladoB, setLadoB] = useState("");
  const [categoria, setCategoria] = useState<CategoriaEvento>("dota2");
  const [duracionMin, setDuracionMin] = useState(String(DURACION_MIN_DEFAULT));
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Rango de fechas para revisar partidas pasadas; arranca en hoy.
  const hoyIso = useMemo(() => hoyIsoEnPeru(), []);
  const [desde, setDesde] = useState(hoyIso);
  const [hasta, setHasta] = useState(hoyIso);
  const esHoy = desde === hoyIso && hasta === hoyIso;

  const refresh = useCallback(async () => {
    const result = esHoy ? await getEventosHoy() : await getEventosPorFecha(desde, hasta);
    if (result.ok) setEventos(result.data);
    else showToast({ variant: "warning", title: "No se pudo cargar", description: result.error });
  }, [esHoy, desde, hasta, showToast]);

  useEffect(() => {
    // Sin pg_cron nadie liquida solo lo que ya cumplió su minuto: se barre
    // al abrir el panel. Solo tiene sentido mirando el día en curso —
    // navegar fechas pasadas es consulta, no debe disparar pagos.
    const previo: Promise<unknown> = esHoy ? liquidarVencidos() : Promise.resolve();
    previo.then(() => refresh());
  }, [refresh, esHoy]);

  // Partidas ya pagadas o canceladas bajan al fondo del panel de hoy:
  // siguen visibles (no desaparecen) pero no tapan lo que todavía
  // necesita atención. Solo aplica al día en curso — en un rango de
  // fechas pasado casi todo ya está resuelto, así que reordenar ahí no
  // ayuda.
  const eventosOrdenados = useMemo(() => {
    if (!eventos || !esHoy) return eventos;
    const terminado = (estado: string) => estado === "resuelto" || estado === "cancelado";
    return [...eventos].sort((a, b) => {
      const aTerminado = terminado(a.evento.estado) ? 1 : 0;
      const bTerminado = terminado(b.evento.estado) ? 1 : 0;
      return aTerminado - bTerminado;
    });
  }, [eventos, esHoy]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const duracion = Number(duracionMin);
    if (!Number.isFinite(duracion) || duracion < 1) {
      setError("La duración debe ser de al menos 1 minuto.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await crearEvento({
        nombre,
        ladoA,
        ladoB,
        categoria,
        duracionMin: duracion,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({ variant: "success", title: "Título publicado" });
      setNombre("");
      setLadoA("");
      setLadoB("");
      setDuracionMin(String(DURACION_MIN_DEFAULT));
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeclarar(eventoId: string, resultado: "a" | "b") {
    setProcesando(eventoId);
    try {
      const result = await declararResultado({ eventoId, resultado });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo declarar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Resultado declarado — sin pagar",
        description: "Tienes 1 minuto para corregirlo antes de confirmar el pago.",
      });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function handleCorregir(eventoId: string, resultado: "a" | "b") {
    setProcesando(eventoId);
    try {
      const result = await corregirResultado({ eventoId, resultado });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo corregir", description: result.error });
        return;
      }
      showToast({
        variant: "success",
        title: "Resultado corregido",
        description: "Es la única corrección posible; revísalo antes de pagar.",
      });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  // Al llegar a 0 el contador de cualquier título, se barre lo vencido.
  const handleVencidos = useCallback(async () => {
    const result = await liquidarVencidos();
    if (result.ok && result.data > 0) await refresh();
  }, [refresh]);

  async function handleConfirmar(eventoId: string) {
    setProcesando(eventoId);
    try {
      const result = await confirmarPago(eventoId);
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo pagar", description: result.error });
        await refresh();
        return;
      }
      showToast({
        variant: "success",
        title: "Pagado",
        description: "Se repartió el dinero y los puntos.",
      });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function handleEstado(eventoId: string, abrir: boolean, minutos?: number) {
    setProcesando(eventoId);
    try {
      const result = await cambiarEstadoEvento({
        eventoId,
        abrir,
        minutos: abrir ? minutos : undefined,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cambiar", description: result.error });
        return;
      }
      showToast({
        variant: abrir ? "success" : "info",
        title: abrir ? "Apuestas abiertas" : "Apuestas cerradas",
        description: abrir
          ? minutos
            ? `Los jugadores pueden apostar por ${minutos} minutos más.`
            : "Los jugadores pueden apostar sin límite de tiempo, hasta que lo cierres."
          : "Ya no entran apuestas nuevas; el resultado sigue sin declararse.",
      });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  /** Blackjack: confirmar que ya se repartió la carta que pidió ese lado. */
  async function handleServirCarta(eventoId: string, lado: "a" | "b") {
    setProcesando(eventoId);
    try {
      const result = await servirCarta({ eventoId, lado });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo marcar", description: result.error });
        return;
      }
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function handleReiniciarTurnos(eventoId: string) {
    setProcesando(eventoId);
    try {
      const result = await reiniciarTurnos(eventoId);
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo reiniciar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Turnos reiniciados",
        description: "La mesa queda como recién sentados. Las apuestas no se tocaron.",
      });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function handleEliminarPrueba(evento: Evento) {
    setEliminandoProcesando(true);
    try {
      const result = await eliminarEventoPrueba({ eventoId: evento.id });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo eliminar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Título eliminado",
        description: `"${evento.nombre}" y sus apuestas quedaron revertidas del saldo de los jugadores.`,
      });
      setEliminandoEvento(null);
      await refresh();
    } finally {
      setEliminandoProcesando(false);
    }
  }

  async function handleCancelar(evento: Evento) {
    setCancelandoProcesando(true);
    try {
      const result = await cancelarEvento({
        eventoId: evento.id,
        motivo: motivoCancelacion.trim() || undefined,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cancelar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Partida cancelada",
        description: "Se devolvió su plata a todos los que apostaron ahí.",
      });
      setCancelandoEvento(null);
      setMotivoCancelacion("");
      await refresh();
    } finally {
      setCancelandoProcesando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Títulos de apuesta</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Publica el título que los jugadores verán en /partidas y declara
          el resultado cuando termine — el saldo se reparte automáticamente
          (cuota 1.80x, lo no emparejado se devuelve).
        </p>

        <Panel className="mt-6 p-5">
          <h2 className="mb-4 font-fantasy text-lg font-semibold text-gold-light">
            Nuevo título
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="nombre" className="mb-1.5 block text-sm text-parchment/80">
                Título de la apuesta
              </label>
              <input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="¿Horno Real gana la serie?"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
            </div>
            <div>
              <label htmlFor="categoria" className="mb-1.5 block text-sm text-parchment/80">
                Categoría
              </label>
              <select
                id="categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaEvento)}
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              >
                {CATEGORIA_OPTIONS.map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="duracion" className="mb-1.5 block text-sm text-parchment/80">
                Minutos hasta el cierre
              </label>
              <input
                id="duracion"
                type="number"
                min={1}
                value={duracionMin}
                onChange={(e) => setDuracionMin(e.target.value)}
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
            </div>
            <div>
              <label htmlFor="ladoA" className="mb-1.5 block text-sm text-parchment/80">
                Lado A
              </label>
              <input
                id="ladoA"
                value={ladoA}
                onChange={(e) => setLadoA(e.target.value)}
                placeholder="GANA"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
            </div>
            <div>
              <label htmlFor="ladoB" className="mb-1.5 block text-sm text-parchment/80">
                Lado B
              </label>
              <input
                id="ladoB"
                value={ladoB}
                onChange={(e) => setLadoB(e.target.value)}
                placeholder="PIERDE"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-lose-glow sm:col-span-2">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting} className="sm:col-span-2">
              {submitting ? "Publicando…" : "Publicar título"}
            </Button>
          </form>
        </Panel>

        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-fantasy text-lg font-semibold text-gold-light">
              {esHoy ? "Títulos de hoy" : "Títulos del período"}
            </h2>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="desde" className="mb-1 block text-[11px] text-parchment/50">
                  Desde
                </label>
                <input
                  id="desde"
                  type="date"
                  value={desde}
                  max={hasta}
                  onChange={(e) => setDesde(e.target.value)}
                  className="min-h-9 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-1 text-xs text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                />
              </div>
              <div>
                <label htmlFor="hasta" className="mb-1 block text-[11px] text-parchment/50">
                  Hasta
                </label>
                <input
                  id="hasta"
                  type="date"
                  value={hasta}
                  min={desde}
                  max={hoyIso}
                  onChange={(e) => setHasta(e.target.value)}
                  className="min-h-9 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-1 text-xs text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDesde(hoyIso);
                  setHasta(hoyIso);
                }}
                disabled={esHoy}
                className="min-h-9 px-3 py-1 text-xs"
              >
                Hoy
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDesde(hoyIsoEnPeru(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
                  setHasta(hoyIso);
                }}
                className="min-h-9 px-3 py-1 text-xs"
              >
                7 días
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDesde(hoyIsoEnPeru(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)));
                  setHasta(hoyIso);
                }}
                className="min-h-9 px-3 py-1 text-xs"
              >
                30 días
              </Button>
            </div>
          </div>

          {eventosOrdenados === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : eventosOrdenados.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              {esHoy
                ? "Todavía no publicaste ningún título hoy."
                : "No hay títulos en ese rango de fechas."}
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {eventosOrdenados.map(({ evento, ladoA, ladoB }) => (
                <Panel key={evento.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-fantasy font-bold text-parchment">{evento.nombre}</p>
                      <p className="text-xs text-parchment/50">
                        {evento.lado_a} vs {evento.lado_b}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <EstadoBadge evento={evento} />
                      <CategoriaBadge categoria={evento.categoria} />
                    </div>
                  </div>

                  <Apostadores ladoA={ladoA} ladoB={ladoB} />

                  {evento.categoria === "blackjack" &&
                  evento.estado !== "resuelto" &&
                  evento.estado !== "cancelado" ? (
                    <MesaDealer
                      evento={evento}
                      procesando={procesando === evento.id}
                      onServir={(lado) => handleServirCarta(evento.id, lado)}
                      onReiniciar={() => handleReiniciarTurnos(evento.id)}
                    />
                  ) : null}

                  {evento.estado !== "resuelto" &&
                  evento.estado !== "cancelado" &&
                  evento.resultado_preliminar === null ? (
                    // Abrir/cerrar apuestas a mano: por defecto sin límite de
                    // tiempo (el admin cierra cuando quiera); el campo de
                    // minutos es la opción aparte para una ventana puntual.
                    // Se oculta una vez declarado el resultado.
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-gold-dark/30 pb-3">
                      <span className="text-xs text-parchment/50">Apuestas:</span>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={procesando === evento.id}
                        onClick={() => handleEstado(evento.id, true)}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        Abrir sin límite
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={procesando === evento.id || evento.estado === "cerrado"}
                        onClick={() => handleEstado(evento.id, false)}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        Cerrar
                      </Button>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          value={minutosExtra[evento.id] ?? String(DURACION_MIN_DEFAULT)}
                          onChange={(e) =>
                            setMinutosExtra((prev) => ({ ...prev, [evento.id]: e.target.value }))
                          }
                          aria-label="Minutos adicionales"
                          className="min-h-9 w-16 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-1 text-xs text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={procesando === evento.id}
                          onClick={() =>
                            handleEstado(
                              evento.id,
                              true,
                              Number(minutosExtra[evento.id]) || DURACION_MIN_DEFAULT
                            )
                          }
                          className="min-h-9 px-3 py-1 text-xs"
                        >
                          Abrir por ese tiempo
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {evento.estado !== "resuelto" && evento.estado !== "cancelado" ? (
                    <div className="mt-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={procesando === evento.id}
                        onClick={() => {
                          setCancelandoEvento(evento);
                          setMotivoCancelacion("");
                        }}
                        className="min-h-8 px-2 py-1 text-xs text-parchment/50"
                      >
                        Cancelar partida (imprevisto)
                      </Button>
                    </div>
                  ) : null}

                  <ResolverPanel
                    evento={evento}
                    procesando={procesando === evento.id}
                    onDeclarar={(resultado) => handleDeclarar(evento.id, resultado)}
                    onCorregir={(resultado) => handleCorregir(evento.id, resultado)}
                    onConfirmar={() => handleConfirmar(evento.id)}
                    onVentanaVencida={handleVencidos}
                  />

                  {HERRAMIENTAS_PRUEBA && evento.estado === "resuelto" ? (
                    <div className="mt-3 border-t border-gold-dark/30 pt-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEliminandoEvento(evento)}
                        className="min-h-8 border border-lose-glow/40 px-2 py-1 text-xs text-lose-glow"
                      >
                        Eliminar (era de prueba)
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>

      {eliminandoEvento ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Eliminar ${eliminandoEvento.nombre}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEliminandoEvento(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-lose-glow">
              Eliminar &quot;{eliminandoEvento.nombre}&quot;
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Borra el título, sus apuestas, emparejamientos, comisión y
              movimientos de saldo — y revierte lo que ganó o perdió cada
              jugador que apostó ahí, como si nunca hubiera pasado (incluye
              bajarle los puntos que ganó). No se puede deshacer.
            </p>
            <p className="mt-2 rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2 text-xs text-parchment/60">
              Si un ganador ya se gastó o retiró esa plata y no le alcanza
              para devolverla, se le deja el saldo en S/0 en vez de
              bloquear todo el borrado — se acepta esa pérdida puntual, no
              se persigue la plata. Si además retiró vía Yape, ese retiro
              sigue marcado como pagado — revierte eso aparte en{" "}
              <strong className="text-parchment/80">Retiros</strong>.
            </p>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="lose"
                disabled={eliminandoProcesando}
                onClick={() => handleEliminarPrueba(eliminandoEvento)}
                className="flex-1"
              >
                {eliminandoProcesando ? "Eliminando…" : "Sí, eliminar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEliminandoEvento(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelandoEvento ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Cancelar ${cancelandoEvento.nombre}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCancelandoEvento(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-lose-glow">
              Cancelar &quot;{cancelandoEvento.nombre}&quot;
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Para cuando algo salió mal y la partida no se puede resolver
              con un ganador — se le devuelve su plata completa (incluida
              la que ya estaba emparejada) a todos los que apostaron acá.
              Nadie gana ni pierde, no se cobra comisión. No se puede
              deshacer.
            </p>

            <label
              htmlFor="motivo-cancelacion"
              className="mt-4 mb-1.5 block text-sm text-parchment/80"
            >
              Motivo (opcional)
            </label>
            <textarea
              id="motivo-cancelacion"
              value={motivoCancelacion}
              onChange={(e) => setMotivoCancelacion(e.target.value)}
              rows={3}
              placeholder="Ej. Se suspendió la partida real"
              className="w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="lose"
                disabled={cancelandoProcesando}
                onClick={() => handleCancelar(cancelandoEvento)}
                className="flex-1"
              >
                {cancelandoProcesando ? "Cancelando…" : "Sí, cancelar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCancelandoEvento(null)}
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

/** Quiénes apostaron a cada lado, con su nickname y cuánto pusieron — para
 * que el admin sepa contra quién está jugando cada quien. Los datos ya
 * vienen en el EventoResumen (ver listarEventos), acá solo se pintan. */
function Apostadores({ ladoA, ladoB }: { ladoA: LadoResumen; ladoB: LadoResumen }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <LadoApostadores lado={ladoA} />
      <LadoApostadores lado={ladoB} />
    </div>
  );
}

function LadoApostadores({ lado }: { lado: LadoResumen }) {
  return (
    <div className="rounded-md border border-gold-dark/30 bg-obsidian/30 p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold tracking-wide text-gold-light">
          {lado.label}
        </span>
        <span className="shrink-0 text-[11px] text-parchment/50">
          {lado.participantes.length} · S/{lado.totalApostado}
        </span>
      </div>
      {lado.participantes.length === 0 ? (
        <p className="text-[11px] text-parchment/40">Nadie todavía</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lado.participantes.map((p) => {
            const sinCubrir = Math.round((p.monto - p.montoMatcheado) * 100) / 100;
            return (
              <li
                key={p.usuarioId}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate text-parchment/80">{p.nickname}</span>
                <span className="shrink-0 text-parchment/60">
                  S/{p.monto}
                  {sinCubrir > 0 ? (
                    <span className="text-parchment/40"> · S/{sinCubrir} sin cubrir</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Ciclo del título: abierto (acepta apuestas) → cerrado (ya no, pero
 * todavía sin resultado) → resuelto (pagado). Un título "abierto" cuyo
 * contador ya venció tampoco acepta apuestas, así que se marca aparte. */
function EstadoBadge({ evento }: { evento: Evento }) {
  // Mismo patrón que CountdownBadge en PartidaCard: el valor inicial se
  // calcula en el inicializador perezoso (no en el cuerpo del render, que
  // debe ser puro) y se refresca con un intervalo.
  const [vencido, setVencido] = useState(
    () => new Date(evento.cierra_en).getTime() <= Date.now()
  );

  useEffect(() => {
    const id = setInterval(() => {
      setVencido(new Date(evento.cierra_en).getTime() <= Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [evento.cierra_en]);

  const { texto, clase } =
    evento.estado === "cancelado"
      ? { texto: "Cancelado", clase: "border-lose/60 text-lose-glow" }
      : evento.estado === "resuelto"
      ? { texto: "Pagado", clase: "border-gold text-gold-light" }
      : evento.estado === "cerrado"
        ? { texto: "Cerrado · sin pagar", clase: "border-lose/60 text-lose-glow" }
        : vencido
          ? { texto: "Cerrado por tiempo", clase: "border-lose/60 text-lose-glow" }
          : { texto: "Apuestas abiertas", clase: "border-win-glow/60 text-win-glow" };

  return (
    <span
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide ${clase}`}
    >
      {texto}
    </span>
  );
}

export default function AdminTitulosPage() {
  return (
    <RequireAdmin>
      <AdminTitulosContent />
    </RequireAdmin>
  );
}

const TURNO_DEALER_LABEL: Record<EstadoTurno, string> = {
  esperando: "En su turno",
  pidiendo: "PIDE CARTA",
  quedado: "Se quedó",
};

/**
 * Lo que ve el que reparte en una mesa de blackjack. La app no reparte
 * cartas: esto solo muestra la señal que mandan los jugadores y deja
 * confirmar que ya se entregó la carta (ver 0039_blackjack.sql).
 */
function MesaDealer({
  evento,
  procesando,
  onServir,
  onReiniciar,
}: {
  evento: Evento;
  procesando: boolean;
  onServir: (lado: "a" | "b") => void;
  onReiniciar: () => void;
}) {
  const lados = [
    { lado: "a" as const, nombre: evento.lado_a, turno: evento.turno_a, cartas: evento.cartas_a },
    { lado: "b" as const, nombre: evento.lado_b, turno: evento.turno_b, cartas: evento.cartas_b },
  ];

  return (
    <div className="mt-3 rounded-md border border-gold-dark/50 bg-obsidian/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-parchment/40">Mesa de blackjack</p>
        <Button
          type="button"
          variant="ghost"
          disabled={procesando}
          onClick={onReiniciar}
          className="min-h-8 px-2 py-0.5 text-[11px]"
        >
          Reiniciar turnos
        </Button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {lados.map(({ lado, nombre, turno, cartas }) => (
          <div
            key={lado}
            className={clsx(
              "rounded-md border px-3 py-2",
              turno === "pidiendo"
                ? "border-gold-light bg-gold/10"
                : turno === "quedado"
                  ? "border-win-glow/50 bg-win/5"
                  : "border-gold-dark/40"
            )}
          >
            <p className="truncate text-xs text-parchment/60">{nombre}</p>
            <p
              className={clsx(
                "mt-0.5 text-sm font-bold",
                turno === "pidiendo"
                  ? "text-gold-light"
                  : turno === "quedado"
                    ? "text-win-glow"
                    : "text-parchment/50"
              )}
            >
              {TURNO_DEALER_LABEL[turno]}
            </p>
            <p className="mt-0.5 text-[11px] text-parchment/40">
              {cartas === 0 ? "Sin cartas pedidas" : cartas === 1 ? "1 carta pedida" : `${cartas} cartas pedidas`}
            </p>
            {turno === "pidiendo" ? (
              <Button
                type="button"
                disabled={procesando}
                onClick={() => onServir(lado)}
                className="mt-2 min-h-8 w-full px-2 py-0.5 text-[11px]"
              >
                Ya le di la carta
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
