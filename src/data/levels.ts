import { Level } from "@/types";

/**
 * Niveles temáticos de panadería, en bandas de 10 puntos. Los nombres
 * coinciden exactamente con el texto horneado en los badges reales
 * (`public/images/levels/nivel-1.png` … `nivel-10.png`, pintados por
 * `LevelBadge`) — si cambias un nombre aquí, el badge queda desalineado.
 */
export const LEVELS: Level[] = [
  { id: 1, nombre: "Masa", min: 0, max: 10 },
  { id: 2, nombre: "Fermento", min: 11, max: 20 },
  { id: 3, nombre: "Horneado", min: 21, max: 30 },
  { id: 4, nombre: "Pan Dorado", min: 31, max: 40 },
  { id: 5, nombre: "Panadero de Bronce", min: 41, max: 50 },
  { id: 6, nombre: "Panadero de Plata", min: 51, max: 60 },
  { id: 7, nombre: "Panadero de Oro", min: 61, max: 70 },
  { id: 8, nombre: "Maestro Panadero", min: 71, max: 80 },
  { id: 9, nombre: "Panadero Legendario", min: 81, max: 90 },
  { id: 10, nombre: "Guardián de la Masa", min: 91, max: null },
];

export function getLevelForPoints(puntos: number): Level {
  const found = LEVELS.find(
    (level) => puntos >= level.min && (level.max === null || puntos <= level.max)
  );
  return found ?? LEVELS[0];
}

export function getNextLevel(level: Level): Level | null {
  return LEVELS.find((l) => l.id === level.id + 1) ?? null;
}
