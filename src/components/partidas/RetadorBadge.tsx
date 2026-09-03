import { getLevelForPoints } from "@/data/levels";
import { LevelCrest } from "@/components/LevelCrest";

/** Escudo neutro con "?" — mismo lenguaje visual que TeamCrest.tsx (path
 * de escudo genérico), para el lado que todavía no tiene retador. */
function EscudoVacante({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Esperando retador"
      className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
    >
      <path
        d="M32 3 58 12v18c0 16-11 27-26 31C17 57 6 46 6 30V12Z"
        fill="#2a2320"
        stroke="var(--color-gold-dark)"
        strokeWidth="2"
      />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontSize="26"
        fontWeight="bold"
        fill="var(--color-parchment)"
        opacity="0.6"
      >
        ?
      </text>
    </svg>
  );
}

export function RetadorBadge({
  retador,
  size = 48,
  /** Solo la insignia, sin el nickname debajo — para listas donde el
   * nombre ya se muestra al costado. */
  soloEscudo = false,
}: {
  retador: { nickname: string; puntos: number } | null;
  size?: number;
  soloEscudo?: boolean;
}) {
  if (!retador) {
    return (
      <div className="flex min-w-0 flex-col items-center gap-1.5">
        <EscudoVacante size={size} />
        {soloEscudo ? null : (
          <p className="text-center text-xs text-parchment/50">Esperando retador</p>
        )}
      </div>
    );
  }

  const level = getLevelForPoints(retador.puntos);
  const insignia = (
    <span
      title={`${level.nombre} · ${retador.puntos} pts`}
      className="inline-flex shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
    >
      <LevelCrest level={level} size={size} />
    </span>
  );

  if (soloEscudo) return insignia;

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      {insignia}
      <p className="w-full truncate text-center text-xs font-semibold text-parchment/85 sm:text-sm">
        {retador.nickname}
      </p>
    </div>
  );
}
