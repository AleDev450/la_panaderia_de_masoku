"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

const STORAGE_KEY = "cachudobet:music-playing";

/**
 * Botón flotante de música de fondo, montado una sola vez en el layout
 * raíz para que el <audio> no se reinicie al navegar entre rutas (Next.js
 * mantiene el layout montado en la navegación por cliente). Suena por
 * defecto — el usuario la apaga si quiere, no al revés — salvo que ya la
 * haya silenciado antes (se respeta esa elección). Los navegadores
 * igual bloquean el autoplay con sonido sin ningún gesto previo del
 * usuario en el dominio; cuando eso pasa, `play()` rechaza la promesa y
 * el botón simplemente queda apagado hasta el primer click, sin error.
 */
export function MusicToggle() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from localStorage on mount
    setReady(true);
    const shouldPlay = stored !== "false";
    if (shouldPlay && audioRef.current) {
      audioRef.current.play().then(
        () => setPlaying(true),
        () => setPlaying(false) // el navegador bloqueó el autoplay; el usuario debe darle play
      );
    }
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      window.localStorage.setItem(STORAGE_KEY, "false");
    } else {
      audio.play().then(() => {
        setPlaying(true);
        window.localStorage.setItem(STORAGE_KEY, "true");
      });
    }
  }

  if (!ready) return null;

  return (
    <>
      <audio ref={audioRef} src="/audio/background.mp3" loop preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? "Silenciar música de fondo" : "Reproducir música de fondo"}
        className={clsx(
          "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border bg-charcoal/90 outline-none backdrop-blur transition sm:h-14 sm:w-14",
          "focus-visible:ring-2 focus-visible:ring-gold-light",
          playing
            ? "border-gold/60 shadow-[0_0_18px_rgba(245,197,24,0.45)]"
            : "border-gold-dark opacity-70 hover:opacity-100"
        )}
      >
        <span aria-hidden className="text-lg leading-none text-gold">
          {playing ? "♪" : "✕"}
        </span>
        <span className="sr-only">{playing ? "Música activada" : "Música silenciada"}</span>
      </button>
    </>
  );
}
