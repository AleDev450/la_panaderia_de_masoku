"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const sparkPositions = [
  { top: "18%", left: "12%", delay: 0 },
  { top: "30%", left: "84%", delay: 0.6 },
  { top: "68%", left: "8%", delay: 1.1 },
  { top: "76%", left: "90%", delay: 1.6 },
  { top: "10%", left: "60%", delay: 2.1 },
];

export function Mascot({ caption = "Guardián de la masa" }: { caption?: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute h-64 w-64 rounded-full bg-gold/25 blur-3xl sm:h-80 sm:w-80"
      />

      {sparkPositions.map((spark, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-gold-light shadow-[0_0_8px_2px_rgba(232,200,119,0.8)]"
          style={{ top: spark.top, left: spark.left }}
          animate={{ opacity: [0, 1, 0], y: [0, -14, -24] }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            delay: spark.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="relative z-10 w-56 sm:w-72 md:w-80"
      >
        <Image
          src="/images/mascota.png"
          alt="El Guardián de la Masa, panadero de batalla, mascota oficial de La Panadería de Masoku"
          width={1130}
          height={1392}
          priority
          className="h-auto w-full select-none"
          draggable={false}
        />
      </motion.div>

      <div
        aria-hidden
        className="relative z-0 -mt-4 h-6 w-40 rounded-[50%] bg-black/60 blur-md sm:w-52"
      />

      <p className="mt-3 font-fantasy text-sm tracking-wide text-gold/80">
        {caption}
      </p>
    </div>
  );
}
