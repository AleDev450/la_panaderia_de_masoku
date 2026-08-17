import { getLevelForPoints, getNextLevel } from "@/data/levels";

export function LevelProgress({ puntos }: { puntos: number }) {
  const level = getLevelForPoints(puntos);
  const siguiente = getNextLevel(level);

  if (!siguiente) {
    return (
      <p className="text-xs text-parchment/60">
        {puntos} pts · nivel máximo alcanzado ({level.nombre}).
      </p>
    );
  }

  const rango = siguiente.min - level.min;
  const avance = Math.min(1, Math.max(0, (puntos - level.min) / rango));
  const faltan = siguiente.min - puntos;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-parchment/60">
        <span>{puntos} exp</span>
        <span>
          Faltan {faltan} pts para {siguiente.nombre}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-obsidian/60">
        <div
          className="h-full rounded-full bg-gold-light"
          style={{ width: `${avance * 100}%` }}
        />
      </div>
    </div>
  );
}
