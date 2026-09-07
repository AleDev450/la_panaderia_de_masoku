"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { CarreraSorteoPanel } from "@/components/sorteos/CarreraSorteoPanel";
import { SorteoConInscripcion, getSorteos } from "@/actions/sorteos";

/**
 * Caballitos, con pantalla propia.
 *
 * La carrera también se ve dentro de /sorteos, que es donde uno se inscribe;
 * esta página existe para poder entrar directo desde Juegos sin pasar por el
 * formulario de Steam y Discord. Es la MISMA carrera —el mismo componente y
 * los mismos datos—, no una copia.
 *
 * Se muestra la del sorteo activo. Si hay varios abiertos, el más reciente:
 * es el que se está corriendo en el stream.
 */

function CaballitosContent() {
  const [sorteos, setSorteos] = useState<SorteoConInscripcion[] | null>(null);

  const refresh = useCallback(async () => {
    const result = await getSorteos();
    if (result.ok) setSorteos(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // Lento a propósito: acá solo interesa si apareció un sorteo nuevo. La
    // carrera en sí la refresca su propio panel cada 2 segundos.
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const activo = (sorteos ?? []).find((s) => s.sorteo.activo) ?? null;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">Caballitos</h1>
            <p className="mt-2 max-w-2xl text-sm text-parchment/60">
              Un caballo por cada ticket del sorteo. Corren todos juntos y el primero en
              cruzar se lleva el premio.
            </p>
          </div>
          <Link
            href="/juegos"
            className="text-xs font-semibold text-parchment/50 underline transition hover:text-gold"
          >
            ← Todos los juegos
          </Link>
        </div>

        {sorteos === null ? (
          <p className="mt-8 text-sm text-parchment/50">Cargando…</p>
        ) : !activo ? (
          <Panel className="mt-8 border-dashed p-8 text-center">
            <p className="font-display text-lg text-parchment/70">No hay carrera abierta</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-parchment/45">
              Los caballitos corren con los tickets de un sorteo. Cuando el staff abra uno,
              la pista aparece acá sola.
            </p>
            <Link
              href="/sorteos"
              className="mt-4 inline-block text-xs font-semibold text-gold-light underline"
            >
              Ver sorteos →
            </Link>
          </Panel>
        ) : (
          <>
            <Panel className="mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="font-display text-lg font-bold text-gold-light">
                  {activo.sorteo.nombre}
                </p>
                <p className="mt-0.5 text-sm text-parchment/60">
                  Se corre por {activo.sorteo.premio}
                </p>
              </div>
              {activo.miInscripcion ? (
                <span className="rounded-full border border-win-glow/50 bg-win/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-win-glow">
                  {activo.miInscripcion.tickets === 0
                    ? "Inscrito · sin tickets"
                    : `Corres con ${activo.miInscripcion.tickets} caballo(s)`}
                </span>
              ) : (
                <Link
                  href="/sorteos"
                  className="min-h-11 rounded-lg border border-gold bg-gold px-5 py-2.5 font-display text-sm font-extrabold uppercase tracking-wide text-obsidian transition hover:bg-gold-light"
                >
                  Inscribirme
                </Link>
              )}
            </Panel>

            <CarreraSorteoPanel sorteoId={activo.sorteo.id} />
          </>
        )}
      </main>
    </>
  );
}

export default function CaballitosPage() {
  return (
    <RequirePlayer>
      <CaballitosContent />
    </RequirePlayer>
  );
}
