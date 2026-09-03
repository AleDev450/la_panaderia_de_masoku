"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Logo } from "@/components/brand/Logo";

/**
 * Marca grande de la pantalla de inicio. Antes era `logo.png` a tamaño
 * completo; ahora es el lockup vectorial, que no se pixela y hereda la
 * tipografía de la app.
 */
export function HomeLogo() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="relative z-[2]"
      initial={reduceMotion ? undefined : { opacity: 0, y: -12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Logo size="lg" tagline priority />
    </motion.div>
  );
}
