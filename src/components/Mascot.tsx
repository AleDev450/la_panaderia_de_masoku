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
    <div className="relative flex flex-col items-center justify-center px-4 py-6 lg:py-2">
      <div
        aria-hidden
        className="pointer-events-none absolute h-72 w-72 rounded-full bg-gold/25 blur-3xl sm:h-96 sm:w-96 lg:h-72 lg:w-72 xl:h-80 xl:w-80"
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
        className="relative z-10 w-64 sm:w-80 md:w-96 lg:h-[46vh] lg:max-h-[28rem] lg:min-h-[16rem] lg:w-auto"
      >
        <Image
          src="/images/mascota.png"
          alt="El Guardián de la Masa, panadero de batalla, mascota oficial de La Panadería de Masoku"
          width={1120}
          height={1632}
          priority
          className="h-auto w-full select-none lg:h-full lg:w-auto"
          draggable={false}
        />
      </motion.div>

      <div
        aria-hidden
        className="relative z-0 -mt-4 h-7 w-48 rounded-[50%] bg-black/60 blur-md sm:w-64 xl:w-72"
      />

      <p className="mt-3 font-fantasy text-base tracking-wide text-gold/80 xl:text-lg">
        {caption}
      </p>
    </div>
  );
}
