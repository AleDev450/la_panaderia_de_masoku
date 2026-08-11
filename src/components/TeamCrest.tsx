import { Team } from "@/types";

/**
 * Fully original, hand-drawn crest icons — no third-party or licensed
 * team logos are used anywhere in this project.
 */
function CrestGlyph({ crest }: { crest: Team["crest"] }) {
  switch (crest) {
    case "forge":
      return (
        <path
          d="M20 34h24l-3 6H23l-3-6Zm-2 8h28v5H18v-5Zm4-14 4-8h12l4 8-10 4-10-4Z"
          fill="currentColor"
        />
      );
    case "moon":
      return (
        <path
          d="M34 12a18 18 0 1 0 12 31.4A14 14 0 0 1 34 12Z"
          fill="currentColor"
        />
      );
    case "bakers":
      return (
        <path
          d="M32 12c5 0 8 4 8 8 0 3-1 5-3 7 5 1 8 5 8 10 0 6-6 11-13 11s-13-5-13-11c0-5 3-9 8-10-2-2-3-4-3-7 0-4 3-8 8-8Z"
          fill="currentColor"
        />
      );
    case "raven":
      return (
        <path
          d="M32 14c9 0 16 6 18 14-3-2-6-3-9-3 3 3 5 7 5 12-4-4-9-6-14-6s-10 2-14 6c0-5 2-9 5-12-3 0-6 1-9 3 2-8 9-14 18-14Z"
          fill="currentColor"
        />
      );
    case "stag":
      return (
        <path
          d="M32 44c-6 0-10-4-10-9 0-3 1-5 3-7-2 0-4 1-6 3l1-6 6-2c-1-3-3-5-3-9 3 1 5 3 6 6 1-3 3-5 6-6 0 4-2 6-3 9l6 2 1 6c-2-2-4-3-6-3 2 2 3 4 3 7 0 5-4 9-10 9-1 0-2-2-2-3s1-3 2-3 2 2 2 3-1 3 4 3Z"
          fill="currentColor"
        />
      );
    case "eye":
      return (
        <path
          d="M14 32s8-12 18-12 18 12 18 12-8 12-18 12-18-12-18-12Zm18 7a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"
          fill="currentColor"
        />
      );
    case "generic":
      return (
        <path
          d="M32 14c6 0 10 4 10 9 0 3-1 5-3 7 6 1 10 6 10 12 0 1-1 2-2 2H17c-1 0-2-1-2-2 0-6 4-11 10-12-2-2-3-4-3-7 0-5 4-9 10-9Z"
          fill="currentColor"
        />
      );
  }
}

export function TeamCrest({ team, size = 56 }: { team: Team; size?: number }) {
  const gradientId = `crest-${team.id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Escudo de ${team.name}`}
      className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={team.colorFrom} />
          <stop offset="100%" stopColor={team.colorTo} />
        </linearGradient>
      </defs>
      <path
        d="M32 3 58 12v18c0 16-11 27-26 31C17 57 6 46 6 30V12Z"
        fill={`url(#${gradientId})`}
        stroke="var(--color-gold)"
        strokeWidth="2"
      />
      <g className="text-parchment">
        <CrestGlyph crest={team.crest} />
      </g>
    </svg>
  );
}
