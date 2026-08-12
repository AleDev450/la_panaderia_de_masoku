import Image from "next/image";
import clsx from "clsx";
import { getLevelForPoints } from "@/data/levels";

export function LevelBadge({
  puntos,
  size = "md",
}: {
  puntos: number;
  size?: "sm" | "md" | "lg";
}) {
  const level = getLevelForPoints(puntos);

  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size];
  const iconSize = { sm: 24, md: 32, lg: 48 }[size];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-gold-dark bg-obsidian/40 py-1 pl-1 pr-2.5",
        textSize
      )}
      title={`${level.nombre} · ${puntos} pts`}
    >
      <Image
        src={`/images/levels/nivel-${level.id}.png`}
        alt=""
        aria-hidden
        width={iconSize}
        height={iconSize}
        className="shrink-0 select-none object-contain"
        style={{ width: iconSize, height: iconSize }}
      />
      <span className="font-fantasy font-semibold text-gold-light">{level.nombre}</span>
      <span className="text-parchment/50">· {puntos} pts</span>
    </span>
  );
}
