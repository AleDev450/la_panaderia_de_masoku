"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { PartidaCard } from "@/components/partidas/PartidaCard";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { crearApuesta, getEventosHoy, EventoResumen } from "@/actions/betting";

function PartidasContent() {
  const router = useRouter();
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);

  const refresh = useCallback(async () => {
    const result = await getEventosHoy();
    if (result.ok) setEventos(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

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
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="text-center">
          <h1 className="font-fantasy text-3xl font-bold tracking-wide text-parchment sm:text-4xl">
            Partidas de hoy
          </h1>
          <p className="mt-2 font-fantasy text-sm font-semibold uppercase tracking-[0.25em] text-gold-light">
            Apuestas con emparejamiento parcial · cuota 1.80x
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-parchment/60">
            Apuesta el monto que quieras — se empareja contra el lado
            contrario hasta cubrir lo pedido; lo que sobre al cierre se
            devuelve a tu saldo.
          </p>
        </div>

        {eventos === null ? (
          <p className="mt-10 text-center text-sm text-parchment/50">Cargando partidas…</p>
        ) : eventos.length === 0 ? (
          <p className="mt-10 text-center text-sm text-parchment/50">
            Todavía no hay títulos publicados hoy — vuelve más tarde.
          </p>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {eventos.map((resumen) => (
              <PartidaCard key={resumen.evento.id} resumen={resumen} onApostar={handleApostar} />
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-parchment/40">18+ · Juego responsable</div>
      </main>
    </>
  );
}

export default function PartidasPage() {
  return (
    <RequireAuth>
      <PartidasContent />
    </RequireAuth>
  );
}
