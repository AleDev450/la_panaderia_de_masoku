"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Burbujas } from "@/components/mensajes/Burbujas";
import { HiloResumen, enviarMensaje, getHilo, getHilos } from "@/actions/mensajes";
import { MensajeSoporte } from "@/lib/supabase/types";

/**
 * Bandeja del staff: la lista de conversaciones a la izquierda y el hilo
 * abierto a la derecha.
 *
 * Lo que espera respuesta va arriba del todo — el orden lo decide `getHilos`,
 * no esta pantalla. Abrir un hilo lo marca leído, así que el globo del menú
 * baja solo.
 */

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminMensajesContent() {
  const [hilos, setHilos] = useState<HiloResumen[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeSoporte[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarHilos = useCallback(async () => {
    const result = await getHilos();
    if (result.ok) setHilos(result.data);
  }, []);

  const cargarHilo = useCallback(async (usuarioId: string) => {
    const result = await getHilo(usuarioId);
    if (result.ok) setMensajes(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    cargarHilos();
    const id = setInterval(cargarHilos, 10_000);
    return () => clearInterval(id);
  }, [cargarHilos]);

  // El hilo abierto se refresca aparte: el jugador puede estar escribiendo
  // mientras el staff lee.
  useEffect(() => {
    if (!abierto) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al cambiar de hilo; el estado viene del servidor, no se deriva de props
    void cargarHilo(abierto);
    const id = setInterval(() => void cargarHilo(abierto), 8_000);
    return () => clearInterval(id);
  }, [abierto, cargarHilo]);

  async function handleResponder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo || !abierto) return;

    setEnviando(true);
    setError(null);
    try {
      const result = await enviarMensaje({ usuarioId: abierto, cuerpo });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTexto("");
      await Promise.all([cargarHilo(abierto), cargarHilos()]);
    } finally {
      setEnviando(false);
    }
  }

  const hiloActual = hilos?.find((h) => h.usuarioId === abierto);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">Mensajes</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Conversaciones con los jugadores. Lo que espera respuesta aparece primero.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          {/* ------------------------------------------------ bandeja */}
          <Panel className="overflow-hidden p-0">
            <div className="max-h-[34rem] overflow-y-auto">
              {hilos === null ? (
                <p className="p-6 text-sm text-parchment/50">Cargando…</p>
              ) : hilos.length === 0 ? (
                <p className="p-6 text-sm text-parchment/45">
                  Nadie ha escrito todavía.
                </p>
              ) : (
                hilos.map((h) => (
                  <button
                    key={h.usuarioId}
                    type="button"
                    onClick={() => setAbierto(h.usuarioId)}
                    className={clsx(
                      "block w-full border-b border-gold-dark/30 px-4 py-3 text-left transition last:border-0",
                      abierto === h.usuarioId ? "bg-gold/10" : "hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-display text-sm font-bold text-parchment">
                        {h.nickname}
                      </span>
                      {h.sinLeer > 0 ? (
                        <span className="shrink-0 rounded-full bg-lose px-1.5 py-0.5 font-display text-[10px] font-black text-parchment">
                          {h.sinLeer}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-parchment/50">
                      {h.ultimoDeStaff ? (
                        <span className="text-parchment/35">Respondido: </span>
                      ) : null}
                      {h.ultimoMensaje}
                    </p>
                    <p className="mt-0.5 text-[10px] text-parchment/35">
                      {fechaCorta(h.ultimaFecha)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </Panel>

          {/* --------------------------------------------------- hilo */}
          <Panel className="flex flex-col overflow-hidden p-0">
            {!abierto ? (
              <p className="m-auto p-10 text-center text-sm text-parchment/45">
                Elige una conversación de la izquierda.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-dark px-4 py-2.5">
                  <h2 className="font-display text-sm font-bold text-parchment">
                    {hiloActual?.nickname ?? "Conversación"}
                  </h2>
                  <Link
                    href={`/bakery/usuarios/${abierto}`}
                    className="text-[11px] font-semibold text-gold-light underline"
                  >
                    Ver su historial de apuestas →
                  </Link>
                </div>

                <Burbujas
                  mensajes={mensajes}
                  soyStaff
                  vacio="Sin mensajes en esta conversación."
                />

                <form onSubmit={handleResponder} className="border-t border-gold-dark p-3">
                  <label htmlFor="respuesta" className="sr-only">
                    Tu respuesta
                  </label>
                  <div className="flex items-end gap-2">
                    <textarea
                      id="respuesta"
                      rows={2}
                      maxLength={2000}
                      value={texto}
                      onChange={(e) => {
                        setTexto(e.target.value);
                        setError(null);
                      }}
                      placeholder="Escribe tu respuesta…"
                      className="min-h-11 flex-1 resize-none rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                    />
                    <Button
                      type="submit"
                      disabled={enviando || texto.trim() === ""}
                      className="shrink-0"
                    >
                      {enviando ? "…" : "Responder"}
                    </Button>
                  </div>
                  {error ? <p className="mt-2 text-sm text-lose-glow">{error}</p> : null}
                </form>
              </>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}

export default function AdminMensajesPage() {
  return (
    <RequireAdmin>
      <AdminMensajesContent />
    </RequireAdmin>
  );
}
