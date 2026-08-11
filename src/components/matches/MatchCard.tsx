import { Match } from "@/types";
import { Panel } from "@/components/ui/Panel";
import { TeamCrest } from "@/components/TeamCrest";
import { Button } from "@/components/ui/Button";
import { CountdownBadge } from "@/components/CountdownBadge";
import clsx from "clsx";

export function MatchCard({
  match,
  onOpen,
}: {
  match: Match;
  onOpen: (matchId: string) => void;
}) {
  const duel = match.duel;
  const cerrado = match.estado !== "abierto";

  return (
    <Panel className="flex flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md border border-gold-dark bg-charcoal px-3 py-1 font-fantasy text-sm font-bold text-gold-light">
          {match.time}
        </span>
        <span className="rounded-md border border-gold-dark/60 px-2 py-1 text-[11px] font-semibold tracking-wide text-parchment/60">
          {match.format}
        </span>
        <CountdownBadge match={match} />
      </div>

      <p className="mt-3 text-center font-fantasy text-sm font-semibold text-parchment">
        {match.titulo}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <TeamSide team={match.teamA} />
        <div
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-fantasy text-xs font-bold",
            duel?.status === "paired"
              ? "border-gold-light bg-gold/10 text-gold-light"
              : "border-gold-dark text-gold/70"
          )}
        >
          1:1
        </div>
        <TeamSide team={match.teamB} align="right" />
      </div>

      <div className="mt-5">
        {match.estado === "resuelto" ? (
          <StatusResuelto resultado={match.resultado} />
        ) : duel === null ? (
          <StatusOpen />
        ) : duel.status === "pending" ? (
          <StatusPending
            side={duel.side}
            amount={duel.amount}
            creatorNickname={duel.creatorBet.userNickname}
          />
        ) : (
          <StatusPaired
            ganaNickname={duel.ganaBet.userNickname}
            pierdeNickname={duel.pierdeBet.userNickname}
            amount={duel.amount}
          />
        )}
      </div>

      <Button
        type="button"
        onClick={() => onOpen(match.id)}
        disabled={cerrado || duel?.status === "paired"}
        className="mt-5 w-full"
      >
        {match.estado === "resuelto"
          ? "Título resuelto"
          : cerrado
            ? "Título cerrado"
            : duel === null
              ? "Crear apuesta"
              : duel.status === "pending"
                ? `Tomar reto · S/${duel.amount}`
                : "Duelo completo"}
      </Button>
    </Panel>
  );
}

function TeamSide({ team, align = "left" }: { team: Match["teamA"]; align?: "left" | "right" }) {
  return (
    <div className={clsx("flex min-w-0 flex-1 flex-col items-center gap-2", align === "right" && "items-center")}>
      <TeamCrest team={team} size={48} />
      <p className="w-full truncate text-center text-xs font-semibold text-parchment/85 sm:text-sm">
        {team.name}
      </p>
    </div>
  );
}

function StatusOpen() {
  return (
    <div className="rounded-md border border-dashed border-gold-dark/70 px-3 py-2.5 text-center text-xs text-parchment/50">
      Sin reto activo — sé el primero en publicar
    </div>
  );
}

function StatusPending({
  side,
  amount,
  creatorNickname,
}: {
  side: "GANA" | "PIERDE";
  amount: number;
  creatorNickname: string;
}) {
  const opposite = side === "GANA" ? "PIERDE" : "GANA";
  return (
    <div className="space-y-1.5 text-xs sm:text-sm">
      <p className="flex items-center justify-between">
        <span className="text-parchment/60">{creatorNickname} apostó</span>
        <span
          className={clsx(
            "font-fantasy font-bold",
            side === "GANA" ? "text-win-glow" : "text-lose-glow"
          )}
        >
          {side} · S/{amount}
        </span>
      </p>
      <p className="flex items-center justify-between rounded-md border border-gold-dark/50 bg-obsidian/40 px-2.5 py-1.5">
        <span className="text-parchment/60">Se busca</span>
        <span
          className={clsx(
            "font-fantasy font-bold",
            opposite === "GANA" ? "text-win-glow" : "text-lose-glow"
          )}
        >
          {opposite} · S/{amount}
        </span>
      </p>
    </div>
  );
}

function StatusPaired({
  ganaNickname,
  pierdeNickname,
  amount,
}: {
  ganaNickname: string;
  pierdeNickname: string;
  amount: number;
}) {
  return (
    <div className="space-y-1.5">
      <p className="rounded-md border border-gold-light/60 bg-gold/10 px-2.5 py-1.5 text-center font-fantasy text-xs font-bold tracking-wide text-gold-light">
        DUELO EMPAREJADO 1:1
      </p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-win-glow">{ganaNickname} · GANA</span>
        <span className="text-parchment/50">S/{amount} c/u</span>
        <span className="text-lose-glow">{pierdeNickname} · PIERDE</span>
      </div>
    </div>
  );
}

function StatusResuelto({ resultado }: { resultado?: "GANA" | "PIERDE" }) {
  return (
    <div className="rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2.5 text-center text-xs text-parchment/60">
      Resultado: <span className="font-fantasy font-bold text-gold-light">{resultado}</span>
    </div>
  );
}
