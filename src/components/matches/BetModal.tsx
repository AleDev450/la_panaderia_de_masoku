"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { BET_MAX, BET_MIN, BetSide, Match } from "@/types";
import { getOppositeSide, validateAmount } from "@/services/betService";
import { Button } from "@/components/ui/Button";
import { TeamCrest } from "@/components/TeamCrest";

export function BetModal({
  match,
  onClose,
  onPublish,
  onAccept,
}: {
  match: Match;
  onClose: () => void;
  onPublish: (side: BetSide, amount: number) => void;
  onAccept: () => void;
}) {
  const titleId = useId();
  const duel = match.duel;
  const hasChallenge = duel !== null && duel.status === "pending";

  const [side, setSide] = useState<BetSide>(
    hasChallenge ? getOppositeSide(duel.side) : "GANA"
  );
  const [amount, setAmount] = useState<string>(
    hasChallenge ? String(duel.amount) : ""
  );
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const amountLocked = hasChallenge;

  const summary = useMemo(() => {
    const numericAmount = amountLocked ? duel.amount : Number(amount);
    return { side, amount: numericAmount };
  }, [side, amount, amountLocked, duel]);

  function handleConfirm() {
    if (hasChallenge) {
      onAccept();
      return;
    }
    const numericAmount = Number(amount);
    const validation = validateAmount(numericAmount);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    onPublish(side, numericAmount);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="panel-stone max-h-[92vh] w-full max-w-lg overflow-y-auto scrollbar-thin rounded-t-2xl p-5 sm:rounded-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <TeamCrest team={match.teamA} size={40} />
            <span className="font-fantasy text-xs text-parchment/50">VS</span>
            <TeamCrest team={match.teamB} size={40} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-parchment/60 hover:text-gold-light"
          >
            ✕
          </button>
        </div>

        <h2 id={titleId} className="font-fantasy text-xl font-bold text-parchment sm:text-2xl">
          {match.titulo}
        </h2>

        {hasChallenge ? (
          <p className="mt-2 text-sm text-parchment/60">
            Reto publicado por{" "}
            <span className="font-semibold text-gold-light">
              {duel.creatorBet.userNickname}
            </span>
            . Debes tomar el lado contrario, mismo monto.
          </p>
        ) : (
          <p className="mt-2 text-sm text-parchment/60">
            No hay reto activo. Elige tu lado y publica el monto.
          </p>
        )}

        <fieldset className="mt-5" disabled={hasChallenge}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-parchment/50">
            Elige tu lado
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <SideButton
              label="GANA"
              active={side === "GANA"}
              onClick={() => setSide("GANA")}
              variant="win"
            />
            <SideButton
              label="PIERDE"
              active={side === "PIERDE"}
              onClick={() => setSide("PIERDE")}
              variant="lose"
            />
          </div>
        </fieldset>

        <div className="mt-5">
          <label htmlFor="bet-amount" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-parchment/50">
            Monto (S/{BET_MIN} – S/{BET_MAX})
          </label>
          <input
            id="bet-amount"
            type="number"
            inputMode="numeric"
            min={BET_MIN}
            max={BET_MAX}
            value={amountLocked ? duel.amount : amount}
            disabled={amountLocked}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(undefined);
            }}
            aria-describedby={error ? "bet-amount-error" : undefined}
            aria-invalid={Boolean(error)}
            className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-lg font-semibold text-parchment outline-none disabled:opacity-70"
          />
          {error ? (
            <p id="bet-amount-error" role="alert" className="mt-1 text-xs text-lose-glow">
              {error}
            </p>
          ) : null}
          {amountLocked ? (
            <p className="mt-1 text-xs text-parchment/50">
              Monto bloqueado por el reto original.
            </p>
          ) : null}
        </div>

        <div className="mt-5 rounded-md border border-gold-dark/60 bg-obsidian/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-parchment/50">
            Resumen de tu apuesta
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-parchment/70">Lado</span>
            <span
              className={clsx(
                "font-fantasy font-bold",
                summary.side === "GANA" ? "text-win-glow" : "text-lose-glow"
              )}
            >
              {summary.side}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-parchment/70">Monto</span>
            <span className="font-fantasy font-bold text-gold-light">
              S/{Number.isFinite(summary.amount) && summary.amount > 0 ? summary.amount : "—"}
            </span>
          </div>
        </div>

        <Button type="button" onClick={handleConfirm} className="mt-5 w-full">
          {hasChallenge ? "Confirmar duelo 1:1" : "Publicar reto"}
        </Button>
        <p className="mt-3 text-center text-[11px] text-parchment/40">
          Una vez registrada, tu apuesta no se puede retirar.
        </p>
      </motion.div>
    </div>
  );
}

function SideButton({
  label,
  active,
  onClick,
  variant,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant: "win" | "lose";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "min-h-14 rounded-md border-2 font-fantasy text-base font-bold tracking-wide transition disabled:cursor-not-allowed disabled:opacity-30",
        variant === "win"
          ? active
            ? "border-win-glow bg-win/20 text-win-glow"
            : "border-gold-dark/60 text-parchment/60 hover:border-win-glow/60"
          : active
            ? "border-lose-glow bg-lose/20 text-lose-glow"
            : "border-gold-dark/60 text-parchment/60 hover:border-lose-glow/60"
      )}
    >
      {label}
    </button>
  );
}
