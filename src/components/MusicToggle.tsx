"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

const STORAGE_KEY = "lapanaderia:music-playing";

/**
 * Botón flotante de música de fondo, montado una sola vez en el layout
 * raíz para que el <audio> no se reinicie al navegar entre rutas (Next.js
 * mantiene el layout montado en la navegación por cliente). Los
 * navegadores bloquean el autoplay con sonido sin gesto del usuario, así
 * que arranca en pausa — el primer click del usuario la activa.
 */
export function MusicToggle() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap from localStorage on mount
    setReady(true);
    if (stored === "true" && audioRef.current) {
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
          "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full outline-none transition sm:h-14 sm:w-14",
          "focus-visible:ring-2 focus-visible:ring-gold-light",
          playing
            ? "drop-shadow-[0_0_14px_rgba(232,200,119,0.75)]"
            : "opacity-70 grayscale hover:opacity-90"
        )}
      >
        <Image
          src="/images/btn-sonido.png"
          alt=""
          width={56}
          height={56}
          className="h-full w-full select-none object-contain"
        />
        <span className="sr-only">{playing ? "Música activada" : "Música silenciada"}</span>
      </button>
    </>
  );
}
