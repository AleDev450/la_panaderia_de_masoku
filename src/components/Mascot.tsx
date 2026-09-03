"use client";

import Image from "next/image";
import { useState } from "react";
import { Isotipo } from "@/components/brand/Logo";

/**
 * Masoku, la cara de CACHUDOBET.
 *
 * DÓNDE VA TU FOTO: `public/images/brand/masoku.png`, recortada en PNG con
 * transparencia. En cuanto exista, aparece acá sola — no hay que tocar
 * código.
 *
 * Mientras no exista se muestra el isotipo de cachos en grande, que es una
 * composición terminada y no un hueco. Se resuelve con `onError` y no
 * comprobando el archivo en build: así el cambio es soltar el PNG y
 * recargar.
 *
 * El `masoku.png` anterior NO se reutiliza: era la ilustración del panadero
 * de caricatura (gorro de chef, rodillo, escudo de pan), justo lo que el
 * rebrand saca.
 */
export function Mascot() {
  const [sinFoto, setSinFoto] = useState(false);

  return (
    <div className="relative flex items-end justify-center lg:block">
      {/* Halo amarillo detrás de la figura. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-[2] h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/25 blur-[70px]"
      />

      {sinFoto ? (
        <div
          className="relative flex w-full items-center justify-center"
          style={{ aspectRatio: "1120 / 1632" }}
        >
          <Isotipo size={420} priority className="w-full max-w-none brand-glow" />
        </div>
      ) : (
        <>
          {/* Cachos gigantes de fondo, como en el arte de marca. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -z-[1] w-[115%] -translate-x-1/2 -translate-y-[55%] opacity-[0.08]"
          >
            <Isotipo size={520} className="w-full max-w-none" />
          </div>

          <div className="relative w-full" style={{ aspectRatio: "1120 / 1632" }}>
            <Image
              src="/images/brand/masoku.png"
              alt="Masoku, la cara de CACHUDOBET"
              fill
              priority
              sizes="(min-width: 1024px) 32vw, 60vw"
              onError={() => setSinFoto(true)}
              className="select-none object-contain drop-shadow-[0_0_40px_rgba(245,197,24,0.3)] drop-shadow-[0_18px_30px_rgba(0,0,0,0.7)]"
              draggable={false}
            />
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-1/2 -z-[1] h-7 w-40 -translate-x-1/2 rounded-[50%] bg-black/60 blur-md sm:w-56"
          />
        </>
      )}
    </div>
  );
}
