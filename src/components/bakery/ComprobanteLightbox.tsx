"use client";

import { useEffect, useState } from "react";

/**
 * Visor a pantalla completa del comprobante, con zoom por clic — el admin
 * necesita leer la hora y el monto impresos en la imagen para saber si
 * coinciden con lo que declaró el jugador.
 */
export function ComprobanteLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <p className="truncate text-sm text-parchment/80">{alt}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((v) => !v)}
            className="min-h-11 rounded-md border border-gold-dark px-3 py-2 text-xs font-semibold uppercase tracking-wide text-parchment/80 transition hover:border-gold-light hover:text-gold-light"
          >
            {zoom ? "Ajustar" : "Ampliar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 rounded-md text-parchment/70 transition hover:text-parchment"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL del comprobante, no un asset remoto optimizable */}
        <img
          src={src}
          alt={alt}
          onClick={() => setZoom((v) => !v)}
          className={
            zoom
              ? "max-w-none cursor-zoom-out"
              : "mx-auto max-h-full max-w-full cursor-zoom-in object-contain"
          }
          style={zoom ? { width: "200%" } : undefined}
        />
      </div>
    </div>
  );
}
