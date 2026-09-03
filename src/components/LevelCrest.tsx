import { Level } from "@/types";

/**
 * Insignia de rango, dibujada.
 *
 * Reemplaza a `public/images/levels/nivel-N.png`, que eran diez PNGs con
 * el nombre del rango pintado adentro: renombrar un nivel dejaba la imagen
 * diciendo lo contrario. Acá el color sale de `LEVELS`, así que nombre e
 * insignia no pueden desincronizarse, y no hay diez descargas más.
 *
 * El dibujo es la cabeza con cachos del isotipo, teñida del color del
 * rango, dentro de un escudo. No se usa `iso.svg` con un filtro CSS porque
 * teñir un SVG externo obliga a `mask-image`, que no toma el color de
 * forma fiable en todos los navegadores.
 */
export function LevelCrest({ level, size = 28 }: { level: Level; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={level.nombre}
      className="shrink-0"
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id={`crest-${level.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={level.color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={level.color} stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* Escudo */}
      <path
        d="M32 3 58 12v18c0 16-11 27-26 31C17 57 6 46 6 30V12Z"
        fill={`url(#crest-${level.id})`}
        stroke={level.color}
        strokeWidth="2.5"
        strokeOpacity="0.85"
      />

      {/* Cachos + cara, en pequeño */}
      <g fill={level.color}>
        <path d="M22 27 Q16 21 15 13 Q23 20 27 25 Z" />
        <path d="M42 27 Q48 21 49 13 Q41 20 37 25 Z" />
        <path d="M22 26 L42 26 L40 39 L36 49 L32 56 L28 49 L24 39 Z" />
      </g>
      {/* Ojos, recortados con el color del escudo detrás */}
      <g fill="#0d0d10">
        <path d="M25 32 L31 34 L30 38 L24 36 Z" />
        <path d="M39 32 L33 34 L34 38 L40 36 Z" />
      </g>
    </svg>
  );
}
