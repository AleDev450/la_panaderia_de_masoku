"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import {
  EventoResumen,
  crearEvento,
  getEventosHoy,
  resolverEvento,
} from "@/actions/betting";
import { cambiarEstadoEvento } from "@/actions/admin";
import { CategoriaBadge, CATEGORIA_OPTIONS } from "@/components/partidas/CategoriaBadge";
import { CategoriaEvento, Evento } from "@/lib/supabase/types";
import { DURACION_MIN_DEFAULT } from "@/types";

function AdminTitulosContent() {
  const { showToast } = useToast();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [ladoA, setLadoA] = useState("");
  const [ladoB, setLadoB] = useState("");
  const [categoria, setCategoria] = useState<CategoriaEvento>("dota2");
  const [duracionMin, setDuracionMin] = useState(String(DURACION_MIN_DEFAULT));
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getEventosHoy();
    if (result.ok) setEventos(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

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

  async function handleResolver(eventoId: string, resultado: "a" | "b") {
    setProcesando(eventoId);
    try {
      const result = await resolverEvento({ eventoId, resultado });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo resolver", description: result.error });
        return;
      }
      showToast({ variant: "success", title: "Resultado declarado" });
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function handleEstado(eventoId: string, abrir: boolean) {
    setProcesando(eventoId);
    try {
      const result = await cambiarEstadoEvento({
        eventoId,
        abrir,
        minutos: abrir ? Number(duracionMin) || DURACION_MIN_DEFAULT : undefined,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cambiar", description: result.error });
        return;
      }
      showToast({
        variant: abrir ? "success" : "info",
        title: abrir ? "Apuestas abiertas" : "Apuestas cerradas",
        description: abrir
          ? "Los jugadores pueden volver a apostar en este título."
          : "Ya no entran apuestas nuevas; el resultado sigue sin declararse.",
      });
      await refresh();
    } finally {
      setProcesando(null);
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
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Títulos de hoy
          </h2>
          {eventos === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : eventos.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              Todavía no publicaste ningún título hoy.
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {eventos.map(({ evento }) => (
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

                  {evento.estado !== "resuelto" ? (
                    <>
                      {/* Abrir/cerrar apuestas a mano: el contador es el
                          camino automático, esto lo fuerza cuando hace falta. */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-gold-dark/30 pb-3">
                        <span className="text-xs text-parchment/50">Apuestas:</span>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={procesando === evento.id || evento.estado === "abierto"}
                          onClick={() => handleEstado(evento.id, true)}
                          className="min-h-9 px-3 py-1 text-xs"
                        >
                          Abrir
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
                      </div>

                      <div className="mt-3">
                        <p className="mb-2 text-xs text-parchment/50">
                          Declarar resultado — paga 1.80x y reparte puntos. No
                          se puede deshacer.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="win"
                            disabled={procesando === evento.id}
                            onClick={() => handleResolver(evento.id, "a")}
                          >
                            Declarar {evento.lado_a}
                          </Button>
                          <Button
                            type="button"
                            variant="lose"
                            disabled={procesando === evento.id}
                            onClick={() => handleResolver(evento.id, "b")}
                          >
                            Declarar {evento.lado_b}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2 text-xs text-parchment/60">
                      Resultado:{" "}
                      <span className="font-fantasy font-bold text-gold-light">
                        {evento.resultado === "a" ? evento.lado_a : evento.lado_b}
                      </span>{" "}
                      · pagado
                    </p>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
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
    evento.estado === "resuelto"
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
