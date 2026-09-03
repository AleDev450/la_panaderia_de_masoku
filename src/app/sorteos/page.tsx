"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequirePlayer } from "@/components/RequirePlayer";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { SorteoConInscripcion, getSorteos, inscribirseSorteo } from "@/actions/sorteos";
import { PasosNumerados, parsearBloques } from "@/lib/markdown";

/** Lo que se muestra si el sorteo no trae instrucciones propias. Va en el
 * mismo formato que escribe el admin (ver src/lib/markdown.tsx). */
const PASOS_POR_DEFECTO = `Asegúrate de tener tu inventario en público
Puedes ir a [Ajustes de privacidad de Steam](https://steamcommunity.com/my/edit/settings) y poner Inventario → Público.

Regístrate en el formulario
Ingresa tu perfil de Steam y tu usuario de Discord (para contactarte si ganas).

Participación confirmada
Ya estarías participando en el sorteo.`;

function fechaLarga(iso: string) {
  // T12 evita que el huso corra el día al formatear.
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
  });
}

function SorteosContent() {
  const { showToast } = useToast();
  const [sorteos, setSorteos] = useState<SorteoConInscripcion[] | null>(null);

  const refresh = useCallback(async () => {
    const result = await getSorteos();
    setSorteos(result.ok ? result.data : []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  const abiertos = (sorteos ?? []).filter((s) => s.sorteo.activo);
  const cerrados = (sorteos ?? []).filter((s) => !s.sorteo.activo);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-parchment">
          Promociones
        </h1>
        <p className="mt-2 text-sm text-parchment/60">
          Déjanos tu perfil de Steam y tu Discord. Si sales sorteado te
          escribimos por Discord y el premio te llega a esa cuenta de Steam.
        </p>

        {sorteos === null ? (
          <p className="mt-8 text-sm text-parchment/50">Cargando…</p>
        ) : abiertos.length === 0 && cerrados.length === 0 ? (
          <Panel className="mt-8 border-dashed p-8 text-center text-sm text-parchment/50">
            Todavía no hay ningún sorteo. Vuelve pronto.
          </Panel>
        ) : (
          <>
            {abiertos.map((item) => (
              <TarjetaSorteo key={item.sorteo.id} item={item} onGuardado={refresh} showToast={showToast} />
            ))}

            {cerrados.length > 0 ? (
              <section className="mt-10">
                <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
                  Sorteos cerrados
                </h2>
                <div className="space-y-2">
                  {cerrados.map(({ sorteo, miInscripcion, inscritos }) => (
                    <Panel key={sorteo.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-display font-semibold text-parchment/80">{sorteo.nombre}</p>
                        <p className="text-xs text-parchment/50">
                          {sorteo.premio} · {inscritos} inscritos
                        </p>
                      </div>
                      {miInscripcion ? (
                        <span
                          className={clsx(
                            "text-xs font-semibold",
                            miInscripcion.ganador ? "text-win-glow" : "text-parchment/40"
                          )}
                        >
                          {miInscripcion.ganador ? "¡Ganaste!" : "Participaste"}
                        </span>
                      ) : null}
                    </Panel>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

function TarjetaSorteo({
  item,
  onGuardado,
  showToast,
}: {
  item: SorteoConInscripcion;
  onGuardado: () => Promise<void>;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const { sorteo, miInscripcion, inscritos } = item;
  const [discord, setDiscord] = useState(miInscripcion?.discord ?? "");
  const [steamUrl, setSteamUrl] = useState(miInscripcion?.steam_url ?? "");
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const bloques = parsearBloques(sorteo.instrucciones || PASOS_POR_DEFECTO);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setEnviando(true);
    try {
      const result = await inscribirseSorteo({
        sorteoId: sorteo.id,
        discord,
        steamUrl,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: miInscripcion ? "Datos actualizados" : "¡Estás participando!",
        description: miInscripcion
          ? "Guardamos tu nuevo link de Steam."
          : `Ya estás en el sorteo de ${sorteo.premio}.`,
      });
      await onGuardado();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="mt-8">
      <Panel className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[1fr_22rem]">
          {/* Izquierda: de qué va el sorteo y cómo se participa. */}
          <div className="p-6 sm:p-8">
            <h2 className="font-display text-2xl font-bold text-gold-light">{sorteo.nombre}</h2>
            <p className="mt-1 text-sm text-parchment/70">Participa por {sorteo.premio}</p>
            {sorteo.fecha_sorteo ? (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gold-light/70">
                Sorteo · {fechaLarga(sorteo.fecha_sorteo)}
              </p>
            ) : null}

            <div className="mt-6">
              <PasosNumerados bloques={bloques} />
            </div>

            <p className="mt-6 text-xs text-parchment/40">
              {inscritos === 1 ? "1 persona inscrita" : `${inscritos} personas inscritas`}
            </p>
          </div>

          {/* Derecha: el formulario, como en la referencia. */}
          <div className="border-t border-gold-dark/40 bg-obsidian/40 p-6 sm:p-8 lg:border-t-0 lg:border-l">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-gold-light">
              {miInscripcion ? "Ya estás dentro" : "Registro"}
            </p>
            {miInscripcion ? (
              <p className="mt-2 text-center text-sm text-parchment/70">
                Tienes{" "}
                <strong className="text-gold-light">
                  {miInscripcion.tickets} {miInscripcion.tickets === 1 ? "ticket" : "tickets"}
                </strong>
                {miInscripcion.tickets === 0
                  ? " — todavía no te asignaron ninguno."
                  : " en este sorteo."}
              </p>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6">
              <label htmlFor={`discord-${sorteo.id}`} className="mb-1.5 block text-sm text-parchment/80">
                Usuario de Discord
              </label>
              <input
                id={`discord-${sorteo.id}`}
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                placeholder="tuusuario"
                autoComplete="off"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />

              <label
                htmlFor={`steam-${sorteo.id}`}
                className="mt-4 mb-1.5 block text-sm text-parchment/80"
              >
                Link de Steam
              </label>
              <input
                id={`steam-${sorteo.id}`}
                value={steamUrl}
                onChange={(e) => setSteamUrl(e.target.value)}
                placeholder="https://steamcommunity.com/id/tuusuario"
                inputMode="url"
                autoComplete="off"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />

              {error ? <p className="mt-3 text-sm text-lose-glow">{error}</p> : null}

              <Button
                type="submit"
                disabled={enviando || !discord.trim() || !steamUrl.trim()}
                className="mt-5 w-full"
              >
                {enviando
                  ? "Guardando…"
                  : miInscripcion
                    ? "Actualizar mis datos"
                    : "Participar"}
              </Button>

              {miInscripcion ? (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-parchment/40">
                  Si pegaste mal el link, corrígelo acá mismo y vuelve a
                  guardar.
                </p>
              ) : null}
            </form>
          </div>
        </div>
      </Panel>
    </section>
  );
}

export default function SorteosPage() {
  return (
    <RequirePlayer>
      <SorteosContent />
    </RequirePlayer>
  );
}
