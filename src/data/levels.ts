import { Level } from "@/types";

/**
 * Rangos de CACHUDOBET, en bandas de 10 puntos.
 *
 * ANTES los nombres eran de panadería (Masa, Pan Dorado, Maestro
 * Panadero…) y estaban DIBUJADOS dentro de `public/images/levels/nivel-N.png`,
 * así que el nombre y la insignia tenían que coincidir a mano. Al
 * rebrandear eso se vuelve una trampa: renombrar el nivel dejaba el PNG
 * diciendo otra cosa.
 *
 * Por eso la insignia dejó de ser una imagen: `LevelBadge` la dibuja con el
 * isotipo de cachos teñido del color del rango. Ahora el nombre y el color
 * viven en un solo lugar y no se pueden desincronizar.
 */
export const LEVELS: Level[] = [
  { id: 1, nombre: "Novato", min: 0, max: 10, color: "#8b8b93" },
  { id: 2, nombre: "Apostador", min: 11, max: 20, color: "#b0b0ba" },
  { id: 3, nombre: "Cachudito", min: 21, max: 30, color: "#7cc4ff" },
  { id: 4, nombre: "Cachudo", min: 31, max: 40, color: "#5aa9f7" },
  { id: 5, nombre: "Cachudo Bronce", min: 41, max: 50, color: "#c87f3a" },
  { id: 6, nombre: "Cachudo Plata", min: 51, max: 60, color: "#cfd3dc" },
  { id: 7, nombre: "Cachudo Oro", min: 61, max: 70, color: "#f5c518" },
  { id: 8, nombre: "Tiburón", min: 71, max: 80, color: "#c08cff" },
  { id: 9, nombre: "Leyenda", min: 81, max: 90, color: "#ff8fc7" },
  { id: 10, nombre: "Rey Cachudo", min: 91, max: null, color: "#ffd95c" },
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
