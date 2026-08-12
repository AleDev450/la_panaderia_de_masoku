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
import { CategoriaBadge, CATEGORIA_OPTIONS } from "@/components/partidas/CategoriaBadge";
import { CategoriaEvento } from "@/lib/supabase/types";
import { DURACION_MIN_DEFAULT } from "@/types";

function AdminTitulosContent() {
  const { showToast } = useToast();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);
  const [resolviendo, setResolviendo] = useState<string | null>(null);

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
    setResolviendo(eventoId);
    try {
      const result = await resolverEvento({ eventoId, resultado });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo resolver", description: result.error });
        return;
      }
      showToast({ variant: "success", title: "Resultado declarado" });
      await refresh();
    } finally {
      setResolviendo(null);
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
                        {evento.lado_a} vs {evento.lado_b} ·{" "}
                        {evento.estado === "resuelto"
                          ? `Resuelto: ${evento.resultado === "a" ? evento.lado_a : evento.lado_b}`
                          : `estado ${evento.estado}`}
                      </p>
                    </div>
                    <CategoriaBadge categoria={evento.categoria} />
                  </div>

                  {evento.estado !== "resuelto" ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="win"
                        disabled={resolviendo === evento.id}
                        onClick={() => handleResolver(evento.id, "a")}
                      >
                        Declarar {evento.lado_a}
                      </Button>
                      <Button
                        type="button"
                        variant="lose"
                        disabled={resolviendo === evento.id}
                        onClick={() => handleResolver(evento.id, "b")}
                      >
                        Declarar {evento.lado_b}
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default function AdminTitulosPage() {
  return (
    <RequireAdmin>
      <AdminTitulosContent />
    </RequireAdmin>
  );
}
