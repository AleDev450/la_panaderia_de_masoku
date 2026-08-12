"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

export function Mascot() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative flex items-end justify-center lg:block">
      <motion.div
        animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="relative w-56 sm:w-72 md:w-80 lg:h-auto lg:w-full"
        style={{ aspectRatio: "1103 / 1426" }}
      >
        <Image
          src="/images/home/masoku.png"
          alt="Masoku, panadero de batalla, mascota oficial de La Panadería de Masoku"
          fill
          priority
          sizes="(min-width: 1024px) 32vw, 60vw"
          className="select-none object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]"
          draggable={false}
        />
      </motion.div>

      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 -z-[1] h-7 w-40 -translate-x-1/2 rounded-[50%] bg-black/50 blur-md sm:w-56 lg:left-[35%]"
      />
    </div>
  );
}
