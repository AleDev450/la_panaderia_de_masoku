"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Burbujas } from "@/components/mensajes/Burbujas";
import { useSession } from "@/context/SessionContext";
import { enviarMensaje, getMiConversacion } from "@/actions/mensajes";
import { MensajeSoporte } from "@/lib/supabase/types";

/**
 * El chat del jugador con el staff.
 *
 * Un solo hilo por persona: no hay que elegir destinatario ni abrir un
 * "ticket". Se pregunta cada 8 segundos — es una conversación con un humano
 * que además está atendiendo otras cosas, no un chat en vivo.
 */

function MensajesContent() {
  const { user } = useSession();
  const [mensajes, setMensajes] = useState<MensajeSoporte[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await getMiConversacion();
    if (result.ok) setMensajes(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    const id = setInterval(refresh, 8_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo) return;

    setEnviando(true);
    setError(null);
    try {
      const result = await enviarMensaje({ cuerpo });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTexto("");
      await refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">Mensajes</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Escríbele al staff por cualquier problema con tu cuenta, un depósito o una
          apuesta. Te responden acá mismo.
        </p>

        <Panel className="mt-6 flex flex-col overflow-hidden p-0">
          <Burbujas
            mensajes={mensajes}
            soyStaff={false}
            vacio="Todavía no hay mensajes. Escribe el primero y el staff te contesta acá."
          />

          <form onSubmit={handleEnviar} className="border-t border-gold-dark p-3">
            <label htmlFor="mensaje" className="sr-only">
              Tu mensaje
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="mensaje"
                rows={2}
                maxLength={2000}
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setError(null);
                }}
                placeholder="Escribe tu mensaje…"
                className="min-h-11 flex-1 resize-none rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
              <Button type="submit" disabled={enviando || texto.trim() === ""} className="shrink-0">
                {enviando ? "…" : "Enviar"}
              </Button>
            </div>
            {error ? <p className="mt-2 text-sm text-lose-glow">{error}</p> : null}
          </form>
        </Panel>

        {user ? (
          <p className="mt-3 text-[11px] text-parchment/40">
            Escribes como <span className="text-parchment/60">{user.nickname}</span>. El staff
            ve tu nickname y el historial de esta conversación.
          </p>
        ) : null}
      </main>
    </>
  );
}

export default function MensajesPage() {
  return (
    <RequireAuth>
      <MensajesContent />
    </RequireAuth>
  );
}
