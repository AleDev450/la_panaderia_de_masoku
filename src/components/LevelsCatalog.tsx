import { LevelCrest } from "@/components/LevelCrest";
import { LEVELS } from "@/data/levels";
import { Panel } from "@/components/ui/Panel";

/** Catálogo compacto de todos los niveles — para que el jugador vea qué
 * le falta más allá del suyo, sin tener que ir sumando bandas de a 10. */
export function LevelsCatalog() {
  return (
    <Panel className="p-4">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-gold-light">
        Niveles
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {LEVELS.map((level) => (
          <li key={level.id} className="flex items-center gap-2.5">
            <LevelCrest level={level} size={28} />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold" style={{ color: level.color }}>
                {level.nombre}
              </p>
              <p className="text-[11px] text-parchment/40">
                {level.max === null ? `${level.min}+ pts` : `${level.min}–${level.max} pts`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
