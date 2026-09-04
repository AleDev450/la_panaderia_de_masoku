"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { MesasEnVivo } from "@/components/partidas/MesasEnVivo";
import { getEstadoStream } from "@/actions/stream";
import {
  CANAL_KICK,
  EstadoStream,
  URL_CANAL,
  URL_CHAT,
  URL_PLAYER,
  formatearEspectadores,
  tiempoAlAire,
} from "@/lib/stream";

/**
 * La transmisión, dentro de la web.
 *
 * El reproductor y el chat son iframes de Kick. Se comprobó que los dos
 * permiten incrustarse (no mandan `X-Frame-Options` ni `frame-ancestors`), y
 * que la dirección del chat es `/popout/<canal>/chat` — la vieja
 * `/<canal>/chatroom` devuelve 404.
 *
 * EL CARTEL DE "EN VIVO" ES UN ADORNO, NO UN REQUISITO. Sale de la API de
 * Kick, que puede fallar o meter un desafío de Cloudflare; si eso pasa, la
 * página igual muestra el reproductor y el chat. El propio reproductor avisa
 * cuando el canal está apagado.
 */

function EnVivoContent() {
  const [estado, setEstado] = useState<EstadoStream | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const result = await getEstadoStream();
    // Si falla se deja lo último que se supo: mejor un conteo con un minuto
    // de atraso que el cartel parpadeando entre "en vivo" y nada.
    if (result.ok) setEstado(result.data);
    setAhora(Date.now());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
    // 60s: el conteo de espectadores no necesita más, y es una API ajena.
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const alAire = estado?.enVivo ? tiempoAlAire(estado.inicio, ahora) : null;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="title-cachudo text-4xl text-parchment sm:text-5xl">En vivo</h1>
              {estado ? (
                estado.enVivo ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-lose bg-lose/15 px-3 py-1 font-display text-xs font-black uppercase tracking-wide text-lose-glow">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full bg-lose-glow motion-safe:animate-pulse"
                    />
                    En directo
                  </span>
                ) : (
                  <span className="rounded-full border border-gold-dark px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-parchment/45">
                    Fuera del aire
                  </span>
                )
              ) : null}
            </div>

            <p className="mt-2 max-w-2xl text-sm text-parchment/60">
              {estado?.enVivo && estado.titulo ? (
                <span className="text-parchment/85">{estado.titulo}</span>
              ) : (
                <>
                  El canal de{" "}
                  <a
                    href={URL_CANAL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-light underline"
                  >
                    {CANAL_KICK}
                  </a>{" "}
                  en Kick. Cuando esté al aire, la transmisión aparece acá.
                </>
              )}
            </p>

            {estado ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-parchment/45">
                {estado.enVivo ? (
                  <span className="text-parchment/70">
                    👁 {formatearEspectadores(estado.espectadores)} viendo ahora
                  </span>
                ) : null}
                {alAire ? <span>⏱ {alAire} al aire</span> : null}
                {estado.seguidores > 0 ? (
                  <span>★ {formatearEspectadores(estado.seguidores)} seguidores</span>
                ) : null}
              </p>
            ) : null}
          </div>

          <a
            href={URL_CANAL}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 shrink-0 rounded-md border border-gold-dark px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wide text-parchment/70 transition hover:border-gold hover:text-gold"
          >
            Abrir en Kick ↗
          </a>
        </div>

        {/* El chat va al costado en pantallas anchas y debajo en móvil, que es
            donde el video tiene que quedarse arriba sí o sí. */}
        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Panel className="overflow-hidden p-0">
            <div className="relative aspect-video w-full bg-black">
              <iframe
                src={URL_PLAYER}
                title={`Transmisión en vivo de ${CANAL_KICK}`}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </Panel>

          <Panel className="flex flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 border-b border-gold-dark px-4 py-2.5">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-gold-light">
                Chat
              </h2>
              <a
                href={URL_CHAT}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-parchment/50 underline transition hover:text-gold"
              >
                Abrir aparte ↗
              </a>
            </div>

            {/* Alto fijo en móvil para que no empuje la página entera; en
                desktop se estira hasta emparejar al reproductor. */}
            <div className="h-[26rem] w-full bg-obsidian lg:h-auto lg:flex-1">
              <iframe
                src={URL_CHAT}
                title={`Chat en vivo de ${CANAL_KICK}`}
                className="h-full w-full border-0"
              />
            </div>
          </Panel>
        </section>

        <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-parchment/40">
          <strong className="text-parchment/60">Sobre el chat:</strong> leerlo funciona para
          cualquiera. Para <em>escribir</em> hace falta una cuenta de Kick, y como el chat va
          incrustado desde otro sitio, algunos navegadores —Safari, o Chrome con las cookies
          de terceros bloqueadas— no dejan iniciar sesión acá adentro. Si te pasa, usa{" "}
          <a
            href={URL_CHAT}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-light underline"
          >
            abrir aparte
          </a>{" "}
          y escribe desde ahí: es el mismo chat.
        </p>

        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-parchment/40">
          El video arranca sin sonido porque los navegadores no permiten que una página
          empiece a sonar sola. Súbele el volumen desde el reproductor.
        </p>

        {/* Las mesas van DEBAJO del video a propósito: en el celular no se
            puede estar en dos pantallas a la vez, así que el que juega
            blackjack tenía que elegir entre mirar la mano o llegar a marcar
            "pedir". Acá tiene el video arriba y sus botones abajo. */}
        <MesasEnVivo />
      </main>
    </>
  );
}

export default function EnVivoPage() {
  return (
    <RequireAuth>
      <EnVivoContent />
    </RequireAuth>
  );
}
