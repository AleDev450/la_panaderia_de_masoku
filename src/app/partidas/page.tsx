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
import { pagoPorMatcheado } from "@/lib/apuestas";
import { maxPorApuesta, tieneSaldoPartido } from "@/lib/saldo";

function PartidasContent() {
  const router = useRouter();
  const { user, refreshUser } = useSession();
  const { showToast } = useToast();
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

  /** Los que alimentan el modal de "Crear sala": sin filtrar por categoría. */
  const disponibles = (eventos ?? []).filter(estaDisponible);
  /** Los que se listan en pantalla: sí respetan el filtro de categoría. */
  const librosVisibles = visibles.filter(estaDisponible);
  // Todo lo que se puede jugar ahora va junto en un solo listado — un
  // título recién publicado (sin apuestas todavía) es tan "sala activa"
  // como una que ya tiene apostadores, apostar es lo que lo convierte en
  // una con gente adentro.
  const salasActivas = [...salas, ...librosVisibles];

  async function handleApostar(eventoId: string, lado: "a" | "b", monto: number) {
    if (!user) return;
    // Contra `maxPorApuesta` y no contra `balance`: el saldo fake también
    // se puede apostar, y una apuesta sale de una sola bolsa (ver
    // src/lib/saldo.ts).
    const tope = maxPorApuesta(user);
    if (tope <= 0) {
      showToast({
        variant: "warning",
        title: "No tienes saldo",
        description: "Recarga para poder apostar.",
      });
      router.push("/recargar");
      return;
    }
    if (monto > tope) {
      throw new Error(
        tieneSaldoPartido(user)
          ? `Lo máximo que entra en una apuesta es S/${tope} — tu saldo está partido en dos y una apuesta sale de una sola parte.`
          : `Tu saldo disponible es S/${tope}.`
      );
    }

    const result = await crearApuesta({ eventoId, lado, monto });
    if (!result.ok) throw new Error(result.error);

    // Cada apuesta es una orden independiente: apostar otra vez al mismo
    // lado suma exposición, no "edita" la anterior. Se dice explícito
    // porque el reparto entre emparejado y pendiente confunde si no.
    const matcheado = Number(result.data.monto_matcheado);
    const pendiente = Number(result.data.monto_pendiente);
    showToast({
      variant: "success",
      title: `Apostaste S/${result.data.monto_total}`,
      description:
        matcheado > 0 && pendiente > 0
          ? `S/${matcheado} ya tienen rival; S/${pendiente} esperan a que alguien los cubra.`
          : matcheado > 0
            ? `Ya tiene rival: si ganas cobras S/${pagoPorMatcheado(matcheado)}.`
            : "Nadie lo ha cubierto todavía. Si nadie lo hace, se te devuelve al cerrar.",
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
        ) : eventos.length === 0 ? (
          <p className="mt-10 text-center text-sm text-parchment/50">
            Todavía no hay títulos publicados hoy — vuelve más tarde.
          </p>
        ) : (
          <section className="mt-8">
            <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
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
                  />
                ))}
              </div>
            )}
          </section>
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
