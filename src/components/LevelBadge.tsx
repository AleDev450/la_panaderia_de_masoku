import clsx from "clsx";
import { getLevelForPoints } from "@/data/levels";

/**
 * Ícono provisional por nivel — reemplázalo por las imágenes reales
 * (badges de panadero) en cuanto estén listas: basta con mapear
 * `level.id` a un `<Image>` en vez de este emoji.
 */
const LEVEL_ICONS: Record<number, string> = {
  1: "🍞",
  2: "🥖",
  3: "🥐",
  4: "🥨",
  5: "🧁",
  6: "🍰",
  7: "🎂",
  8: "👨‍🍳",
  9: "🏅",
  10: "👑",
};

export function LevelBadge({
  puntos,
  size = "md",
}: {
  puntos: number;
  size?: "sm" | "md" | "lg";
}) {
  const level = getLevelForPoints(puntos);
  const icon = LEVEL_ICONS[level.id] ?? "🍞";

  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size];
  const iconSize = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-gold-dark bg-obsidian/40 px-2.5 py-1",
        textSize
      )}
      title={`${level.nombre} · ${puntos} pts`}
    >
      <span aria-hidden className={iconSize}>
        {icon}
      </span>
      <span className="font-fantasy font-semibold text-gold-light">{level.nombre}</span>
      <span className="text-parchment/50">· {puntos} pts</span>
    </span>
  );
}
