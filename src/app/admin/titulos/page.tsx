"use client";

import { FormEvent, useState } from "react";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { CountdownBadge } from "@/components/CountdownBadge";
import { useMatches } from "@/context/MatchesContext";
import { useToast } from "@/context/ToastContext";
import { DURACION_MIN_DEFAULT } from "@/types";

function AdminTitulosContent() {
  const { matches, createTitulo, updateDuracion, resolveMatch } = useMatches();
  const { showToast } = useToast();

  const [titulo, setTitulo] = useState("");
  const [nombreEquipoA, setNombreEquipoA] = useState("");
  const [nombreEquipoB, setNombreEquipoB] = useState("");
  const [time, setTime] = useState("");
  const [duracionMin, setDuracionMin] = useState(String(DURACION_MIN_DEFAULT));
  const [error, setError] = useState<string | undefined>();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (titulo.trim().length < 5) {
      setError("El título debe tener al menos 5 caracteres.");
      return;
    }
    if (!nombreEquipoA.trim() || !nombreEquipoB.trim()) {
      setError("Completa el nombre de ambos lados.");
      return;
    }
    if (!time.trim()) {
      setError("Indica la hora del título (p.ej. 20:00).");
      return;
    }
    const duracion = Number(duracionMin);
    if (!Number.isFinite(duracion) || duracion < 1) {
      setError("La duración debe ser de al menos 1 minuto.");
      return;
    }

    createTitulo({
      titulo: titulo.trim(),
      nombreEquipoA: nombreEquipoA.trim(),
      nombreEquipoB: nombreEquipoB.trim(),
      time: time.trim(),
      duracionMin: duracion,
    });
    showToast({ variant: "success", title: "Título publicado" });
    setTitulo("");
    setNombreEquipoA("");
    setNombreEquipoB("");
    setTime("");
    setDuracionMin(String(DURACION_MIN_DEFAULT));
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">
          Títulos de apuesta
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Publica el título que los usuarios elegirán al apostar, y declara
          el resultado cuando termine para repartir puntos (5 al que
          acertó, 1 al que no).
        </p>

        <Panel className="mt-6 p-5">
          <h2 className="mb-4 font-fantasy text-lg font-semibold text-gold-light">
            Nuevo título
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="titulo" className="mb-1.5 block text-sm text-parchment/80">
                Título de la apuesta
              </label>
              <input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="¿Horno Real gana la serie?"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
            </div>
            <div>
              <label htmlFor="equipoA" className="mb-1.5 block text-sm text-parchment/80">
                Lado A (protagonista del título)
              </label>
              <input
                id="equipoA"
                value={nombreEquipoA}
                onChange={(e) => setNombreEquipoA(e.target.value)}
                placeholder="Horno Real"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
            </div>
            <div>
              <label htmlFor="equipoB" className="mb-1.5 block text-sm text-parchment/80">
                Lado B (rival)
              </label>
              <input
                id="equipoB"
                value={nombreEquipoB}
                onChange={(e) => setNombreEquipoB(e.target.value)}
                placeholder="Masa Furiosa"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
            </div>
            <div>
              <label htmlFor="time" className="mb-1.5 block text-sm text-parchment/80">
                Hora
              </label>
              <input
                id="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="20:00"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none"
              />
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

            {error ? (
              <p role="alert" className="text-sm text-lose-glow sm:col-span-2">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="sm:col-span-2">
              Publicar título
            </Button>
          </form>
        </Panel>

        <section className="mt-10">
          <h2 className="mb-3 font-fantasy text-lg font-semibold text-gold-light">
            Títulos existentes
          </h2>
          <div className="flex flex-col gap-3">
            {matches.map((match) => (
              <Panel key={match.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-fantasy font-bold text-parchment">{match.titulo}</p>
                    <p className="text-xs text-parchment/50">
                      {match.teamA.name} vs {match.teamB.name} · {match.time} ·{" "}
                      {match.estado === "resuelto"
                        ? `Resuelto: ${match.resultado}`
                        : `estado ${match.estado}`}
                    </p>
                  </div>
                  <CountdownBadge match={match} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label
                    htmlFor={`duracion-${match.id}`}
                    className="text-xs text-parchment/50"
                  >
                    Duración (min)
                  </label>
                  <input
                    id={`duracion-${match.id}`}
                    type="number"
                    min={1}
                    defaultValue={match.duracionMin}
                    disabled={match.estado === "resuelto"}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value) && value >= 1) {
                        updateDuracion(match.id, value);
                        showToast({ variant: "info", title: "Duración actualizada" });
                      }
                    }}
                    className="min-h-9 w-20 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-1 text-sm text-parchment outline-none disabled:opacity-40"
                  />

                  {match.estado !== "resuelto" ? (
                    <div className="ml-auto flex gap-2">
                      <Button
                        type="button"
                        variant="win"
                        onClick={() => {
                          resolveMatch(match.id, "GANA");
                          showToast({
                            variant: "success",
                            title: "Resultado declarado: GANA",
                          });
                        }}
                      >
                        Declarar GANA
                      </Button>
                      <Button
                        type="button"
                        variant="lose"
                        onClick={() => {
                          resolveMatch(match.id, "PIERDE");
                          showToast({
                            variant: "success",
                            title: "Resultado declarado: PIERDE",
                          });
                        }}
                      >
                        Declarar PIERDE
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Panel>
            ))}
          </div>
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
