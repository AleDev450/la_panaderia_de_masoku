"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PartidaCard } from "@/components/partidas/PartidaCard";
import { CATEGORIAS_DE_MESA } from "@/components/partidas/CategoriaBadge";
import { useApuestas } from "@/components/partidas/useApuestas";
import { Panel } from "@/components/ui/Panel";
import { useSession } from "@/context/SessionContext";
import { EventoResumen, getEventosHoy } from "@/actions/betting";

/**
 * Las mesas de blackjack y baccarat, operables, debajo de la transmisión.
 *
 * POR QUÉ EXISTE ESTA PANTALLA. En el celular no se puede ver el stream y
 * estar en /partidas al mismo tiempo: es una sola pantalla. El que apostaba
 * en blackjack tenía que elegir entre mirar la mano o poder marcar "pedir" y
 * "quedarse" a tiempo. Acá tiene las dos cosas — el video arriba, su mesa
 * abajo, y los botones de turno donde los pueda alcanzar sin salirse.
 *
 * NO ES UNA COPIA DE /partidas. Se muestran SOLO las categorías de mesa: los
 * títulos de dota2 o valorant no tienen nada que ver con lo que está pasando
 * en cámara, y llenar esto con todo el libro del día haría que la mesa propia
 * se pierda entre cosas que no se están jugando ahí.
 *
 * Apostar y marcar turno salen de `useApuestas`, el mismo que usa /partidas.
 */

export function MesasEnVivo() {
  const { user, isAdmin } = useSession();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);

  const refresh = useCallback(async () => {
    const result = await getEventosHoy();
    if (result.ok) setEventos(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // 5s y no 10 como en /partidas: acá el que mira está esperando su carta,
    // y ver "pide carta" con diez segundos de atraso arruina el seguimiento.
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [refresh]);

  const { handleApostar, handleMarcarTurno } = useApuestas({ eventos, refresh });

  // Solo mesas, y solo las que siguen vivas: una mano ya declarada no se
  // puede jugar y solo estorba debajo del video.
  const mesas = (eventos ?? []).filter(
    (r) =>
      CATEGORIAS_DE_MESA.includes(r.evento.categoria) &&
      r.evento.estado === "abierto" &&
      r.evento.resultado_preliminar === null
  );

  // Primero la mesa en la que estoy sentado: es la única en la que hay algo
  // que decidir, y en el celular todo lo demás queda debajo del pliegue.
  const ordenadas = [...mesas].sort((a, b) => Number(b.miLado !== null) - Number(a.miLado !== null));

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-gold-light">
            Mesas en juego ahora
          </h2>
          <p className="mt-0.5 text-xs text-parchment/45">
            Blackjack y baccarat, para jugar sin salir de la transmisión.
          </p>
        </div>
        <Link
          href="/partidas"
          className="text-xs font-semibold text-parchment/50 underline transition hover:text-gold"
        >
          Ver todas las partidas →
        </Link>
      </div>

      {isAdmin ? (
        <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
          El staff no juega. Las mesas se administran desde el panel de eventos.
        </Panel>
      ) : eventos === null ? (
        <p className="text-sm text-parchment/50">Cargando mesas…</p>
      ) : ordenadas.length === 0 ? (
        <Panel className="border-dashed p-6 text-center">
          <p className="text-sm text-parchment/60">No hay mesas abiertas en este momento.</p>
          <p className="mt-1 text-xs text-parchment/40">
            Cuando el staff abra una de blackjack o baccarat, aparece acá sola.
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {ordenadas.map((resumen) => (
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
  );
}
