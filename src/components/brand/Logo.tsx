"use client";

import Image from "next/image";
import clsx from "clsx";
import { useState } from "react";

/**
 * Lockup de marca: isotipo + wordmark.
 *
 * DÓNDE VA TU LOGO DE VERDAD: `public/images/brand/iso.png`, el isotipo
 * recortado en PNG con transparencia (cuadrado, idealmente 512×512). En
 * cuanto exista se usa en TODA la app —header, formularios, insignia de
 * perfil, hero— sin tocar código.
 *
 * Mientras no exista se dibuja `iso.svg`, una aproximación vectorial. Es un
 * respaldo, no el arte final: la geometría real tiene detalle que no vale
 * la pena reproducir a mano.
 *
 * El wordmark va como TEXTO y no dentro de la imagen: así hereda la
 * tipografía, se puede seleccionar y buscar, y no se pixela a ningún
 * tamaño.
 */

const TAMANOS = {
  sm: { iso: 28, texto: "text-base", sub: "text-[8px]" },
  md: { iso: 40, texto: "text-2xl", sub: "text-[9px]" },
  lg: { iso: 64, texto: "text-4xl sm:text-5xl", sub: "text-[11px]" },
  xl: { iso: 96, texto: "text-5xl sm:text-6xl", sub: "text-xs" },
} as const;

/** Isotipo con respaldo: intenta el PNG real y cae al SVG si no está. */
export function Isotipo({
  size,
  className,
  priority = false,
}: {
  size: number;
  className?: string;
  priority?: boolean;
}) {
  const [sinPng, setSinPng] = useState(false);

  return (
    <Image
      src={sinPng ? "/images/brand/iso.svg" : "/images/brand/iso.png"}
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority={priority}
      onError={() => setSinPng(true)}
      className={clsx("shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export function Logo({
  size = "md",
  soloIso = false,
  tagline = false,
  className,
  priority = false,
}: {
  size?: keyof typeof TAMANOS;
  /** Sin wordmark — para espacios angostos (móvil, loading, avatares). */
  soloIso?: boolean;
  /** Muestra "APUESTA · GANA · SACA PROVECHO" debajo del wordmark. */
  tagline?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const t = TAMANOS[size];

  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <Isotipo size={t.iso} priority={priority} className="brand-glow" />
      {soloIso ? (
        <span className="sr-only">CACHUDOBET</span>
      ) : (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={clsx(
              "font-display font-extrabold tracking-tight whitespace-nowrap",
              t.texto
            )}
          >
            <span className="text-parchment">CACHUDO</span>
            <span className="text-gold">BET</span>
          </span>
          {tagline ? (
            <span
              className={clsx(
                "mt-1.5 font-semibold uppercase tracking-[0.3em] text-parchment/40",
                t.sub
              )}
            >
              Apuesta · Gana · Saca provecho
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
