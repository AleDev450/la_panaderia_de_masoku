"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Logo grande de la pantalla de inicio (logo.png). Separado del <Logo>
 * compartido con el Header para no afectar su render en el resto del sitio
 * — aquí el logo es protagonista y usa el arte nuevo a tamaño real.
 */
export function HomeLogo() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="relative z-[2] w-[90%] max-w-[680px] sm:w-[520px] lg:w-full lg:max-w-none"
      style={{ aspectRatio: "1536 / 1024" }}
      animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    >
      <Image
        src="/images/home/logo.png"
        alt="La Panadería de Masoku"
        fill
        sizes="(min-width: 640px) 680px, 90vw"
        priority
        className="select-none object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
        draggable={false}
      />
    </motion.div>
  );
}
