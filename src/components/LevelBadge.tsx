import clsx from "clsx";
import { getLevelForPoints } from "@/data/levels";
import { LevelCrest } from "@/components/LevelCrest";

export function LevelBadge({
  puntos,
  size = "md",
}: {
  puntos: number;
  size?: "sm" | "md" | "lg";
}) {
  const level = getLevelForPoints(puntos);

  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size];
  const iconSize = { sm: 22, md: 28, lg: 40 }[size];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border border-gold-dark bg-charcoal py-1 pl-1 pr-3",
        textSize
      )}
      title={`${level.nombre} · ${puntos} pts`}
    >
      <LevelCrest level={level} size={iconSize} />
      <span className="font-display font-bold" style={{ color: level.color }}>
        {level.nombre}
      </span>
      {/* El separador va como carácter, no como "·": en TEXTO JSX los
          escapes unicode no se interpretan (sí dentro de un template
          literal, como en el `title` de arriba) y se imprimían crudos. */}
      <span className="text-parchment/40">· {puntos} pts</span>
    </span>
  );
}
