"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { PartidaCard } from "@/components/partidas/PartidaCard";
import { CrearSalaModal } from "@/components/partidas/CrearSalaModal";
import { CATEGORIA_OPTIONS } from "@/components/partidas/CategoriaBadge";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { crearApuesta, getEventosHoy, EventoResumen } from "@/actions/betting";
import { CategoriaEvento } from "@/lib/supabase/types";

function PartidasContent() {
  const router = useRouter();
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);
  const [categoria, setCategoria] = useState<CategoriaEvento | "todas">("todas");
  const [modalAbierto, setModalAbierto] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getEventosHoy();
    if (result.ok) setEventos(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  const visibles = useMemo(
    () =>
      (eventos ?? []).filter(
        (r) => categoria === "todas" || r.evento.categoria === categoria
      ),
    [eventos, categoria]
  );

  // Una "sala" es un título en el que alguien ya apostó; los demás son
  // títulos disponibles para abrir sala desde el modal.
  const salas = visibles.filter((r) => r.ladoA.retador || r.ladoB.retador);
  const disponibles = (eventos ?? []).filter(
    (r) => r.evento.estado === "abierto" && !r.ladoA.retador && !r.ladoB.retador
  );

  async function handleApostar(eventoId: string, lado: "a" | "b", monto: number) {
    if (!user) return;
    if (user.balance <= 0) {
      showToast({
        variant: "warning",
        title: "No tienes saldo",
        description: "Recarga para poder apostar.",
      });
      router.push("/recargar");
      return;
    }
    if (monto > user.balance) {
      throw new Error(`Tu saldo disponible es S/${user.balance}.`);
    }

    const result = await crearApuesta({ eventoId, lado, monto });
    if (!result.ok) throw new Error(result.error);

    showToast({
      variant: "success",
      title: "Apuesta registrada",
      description:
        result.data.monto_matcheado > 0
          ? `Se emparejaron S/${result.data.monto_matcheado} de inmediato.`
          : "Esperando retador para emparejar tu monto.",
    });
    await Promise.all([refresh(), refreshUser()]);
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="text-center">
          <h1 className="font-fantasy text-3xl font-bold tracking-wide text-parchment sm:text-4xl">
            Partidas de hoy
          </h1>
          <p className="mt-2 font-fantasy text-sm font-semibold uppercase tracking-[0.25em] text-gold-light">
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
        ) : salas.length === 0 ? (
          <p className="mt-10 text-center text-sm text-parchment/50">
            {(eventos ?? []).length === 0
              ? "Todavía no hay títulos publicados hoy — vuelve más tarde."
              : "Nadie ha abierto sala en esta categoría. Sé el primero."}
          </p>
        ) : (
          // Dos columnas como máximo: con tres, cada sala quedaba tan
          // angosta que el campo de monto no se leía.
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
            {salas.map((resumen) => (
              <PartidaCard key={resumen.evento.id} resumen={resumen} onApostar={handleApostar} />
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-parchment/40">18+ · Juego responsable</div>
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
