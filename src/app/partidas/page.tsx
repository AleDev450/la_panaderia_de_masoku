"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { PartidaCard } from "@/components/partidas/PartidaCard";
import { CrearSalaModal } from "@/components/partidas/CrearSalaModal";
import { CATEGORIA_OPTIONS } from "@/components/partidas/CategoriaBadge";
import { HistorialReciente } from "@/components/partidas/HistorialReciente";
import { HeroRonda } from "@/components/ruleta/HeroRonda";
import { useApuestas } from "@/components/partidas/useApuestas";
import { useSession } from "@/context/SessionContext";
import { getEventosHoy, EventoResumen } from "@/actions/betting";
import { CategoriaEvento } from "@/lib/supabase/types";

function PartidasContent() {
  const { user } = useSession();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);
  const [categoria, setCategoria] = useState<CategoriaEvento | "todas">("todas");
  const [modalAbierto, setModalAbierto] = useState(false);
  // Reloj propio: leer Date.now() en el render sería impuro, y hace falta
  // para saber qué títulos ya vencieron su contador.
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    const result = await getEventosHoy();
    if (result.ok) setEventos(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // Otros jugadores entran a las salas mientras miras: sin esto habría
    // que recargar a mano para ver quién cubrió tu apuesta.
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const visibles = useMemo(
    () =>
      (eventos ?? []).filter(
        (r) => categoria === "todas" || r.evento.categoria === categoria
      ),
    [eventos, categoria]
  );

  // Una "sala" es un título en el que alguien ya apostó y que TODAVÍA no
  // terminó — una vez declarado el resultado (aunque el pago siga sin
  // confirmarse), la partida sale de esta lista: revisar partidas pasadas
  // es cosa del admin en /bakery/titulos, no del listado de salas activas.
  const terminada = (r: EventoResumen) =>
    r.evento.estado === "resuelto" ||
    r.evento.estado === "cancelado" ||
    r.evento.resultado_preliminar !== null;
  const salas = visibles.filter(
    (r) => !terminada(r) && (r.ladoA.participantes.length > 0 || r.ladoB.participantes.length > 0)
  );
  const estaDisponible = (r: EventoResumen) =>
    r.evento.estado === "abierto" &&
    r.evento.resultado_preliminar === null &&
    new Date(r.evento.cierra_en).getTime() > ahora &&
    r.ladoA.participantes.length === 0 &&
    r.ladoB.participantes.length === 0;

  /** Los que alimentan el modal de "Crear sala": sin filtrar por categoría,
   * pero SIN blackjack — a una mesa de blackjack se entra desde su propia
   * tarjeta, eligiendo lado, y el motor decide si te sienta ahí o te abre
   * una mesa nueva (0041). "Crear sala" no aplica: las mesas ya existen. */
  const disponibles = (eventos ?? []).filter(
    (r) => estaDisponible(r) && r.evento.categoria !== "blackjack"
  );
  /** Los que se listan en pantalla: sí respetan el filtro de categoría. */
  const librosVisibles = visibles.filter(estaDisponible);
  // Todo lo que se puede jugar ahora va junto en un solo listado — un
  // título recién publicado (sin apuestas todavía) es tan "sala activa"
  // como una que ya tiene apostadores, apostar es lo que lo convierte en
  // una con gente adentro.
  const salasActivas = [...salas, ...librosVisibles];

  // Apostar y marcar turno viven en `useApuestas` porque las mesas debajo
  // del stream (/en-vivo) hacen exactamente lo mismo: con una copia en cada
  // pantalla, una regla arreglada acá se quedaría sin arreglar allá.
  const { handleApostar, handleMarcarTurno } = useApuestas({ eventos, refresh });

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* El panel de resultados va a la derecha en pantallas anchas y se
            apila debajo en el resto — con menos de ~1280px la columna de
            salas ya queda muy angosta para las dos cosas al costado. */}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold tracking-wide text-parchment sm:text-4xl">
              Partidas de hoy
            </h1>
            <p className="mt-2 font-display text-sm font-semibold uppercase tracking-[0.25em] text-gold-light">
              Cuota 1.80x · emparejamiento entre jugadores
            </p>
            <p className="mx-auto mt-3 max-w-lg text-sm text-parchment/60">
              Entra a una sala abierta o crea la tuya. Tu monto se cubre por
              partes desde el lado contrario; lo que nadie cubra vuelve a tu
              saldo al cerrar.
            </p>

            <Button
              type="button"
              onClick={() => setModalAbierto(true)}
              disabled={disponibles.length === 0}
              className="mt-5"
            >
              {disponibles.length === 0 ? "Sin títulos disponibles" : "Crear sala"}
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {[{ value: "todas" as const, label: "Todas" }, ...CATEGORIA_OPTIONS].map((opcion) => (
              <button
                key={opcion.value}
                type="button"
                aria-pressed={categoria === opcion.value}
                onClick={() => setCategoria(opcion.value)}
                className={clsx(
                  "min-h-9 rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-gold-light",
                  categoria === opcion.value
                    ? "border-gold bg-gold-dark/40 text-gold-light"
                    : "border-gold-dark/60 text-parchment/60 hover:border-gold-light"
                )}
              >
                {opcion.label}
              </button>
            ))}
          </div>

          {eventos === null ? (
            <p className="mt-10 text-center text-sm text-parchment/50">Cargando partidas…</p>
          ) : eventos.length === 0 ? (
            <p className="mt-10 text-center text-sm text-parchment/50">
              Todavía no hay títulos publicados hoy — vuelve más tarde.
            </p>
          ) : (
            <section className="mt-8">
              <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
                Salas activas ({salasActivas.length})
              </h2>
              {salasActivas.length === 0 ? (
                <p className="rounded-md border border-dashed border-gold-dark/60 p-6 text-center text-sm text-parchment/50">
                  No hay salas activas en esta categoría todavía.
                </p>
              ) : (
                // Dos columnas como máximo: con tres, cada sala quedaba tan
                // angosta que el campo de monto no se leía.
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {salasActivas.map((resumen) => (
                    <PartidaCard
                      key={resumen.evento.id}
                      resumen={resumen}
                      miUsuarioId={user?.id}
                      onApostar={handleApostar}
                      onMarcarTurno={handleMarcarTurno}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* La ruleta y cara o sello van DEBAJO de las partidas, no encima:
              esta pantalla es "partidas de hoy" y empujar su título por
              debajo del pliegue con otro juego hacía que costara encontrar a
              qué se entró. Acá abajo siguen apareciendo solos, después de
              revisar las salas. Se carga solo, así que el motor de partidas
              no cambia. */}
          <div className="mt-10">
            <HeroRonda />
          </div>

          <div className="mt-8 text-center text-xs text-parchment/40">18+ · Juego responsable</div>
          </div>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <HistorialReciente />
          </aside>
        </div>
      </main>

      {modalAbierto ? (
        <CrearSalaModal
          titulos={disponibles}
          onCrear={handleApostar}
          onClose={() => setModalAbierto(false)}
        />
      ) : null}
    </>
  );
}

export default function PartidasPage() {
  return (
    <RequirePlayer>
      <PartidasContent />
    </RequirePlayer>
  );
}
