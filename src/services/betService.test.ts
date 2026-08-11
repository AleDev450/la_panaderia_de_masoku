import { describe, expect, it } from "vitest";
import {
  BetServiceError,
  acceptChallenge,
  createChallenge,
  getOppositeSide,
  getUserBets,
  isMatchOpen,
  isOwnChallenge,
  pairBets,
  resolveMatch,
  validateAmount,
} from "@/services/betService";
import { Match, PUNTOS_POR_GANAR, PUNTOS_POR_PERDER } from "@/types";
import { teams } from "@/data/teams";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-x",
    titulo: "¿Crimson Forge gana la serie?",
    teamA: teams["crimson-forge"],
    teamB: teams["lunar-wardens"],
    time: "14:00",
    format: "BO3",
    duel: null,
    duracionMin: 10,
    creadoEn: new Date().toISOString(),
    estado: "abierto",
    ...overrides,
  };
}

describe("validateAmount", () => {
  it("rejects amounts below S/10", () => {
    expect(validateAmount(5).valid).toBe(false);
  });
  it("rejects amounts above S/100", () => {
    expect(validateAmount(150).valid).toBe(false);
  });
  it("rejects non-integer amounts", () => {
    expect(validateAmount(40.5).valid).toBe(false);
  });
  it("accepts amounts within S/10-S/100", () => {
    expect(validateAmount(10).valid).toBe(true);
    expect(validateAmount(100).valid).toBe(true);
    expect(validateAmount(40).valid).toBe(true);
  });
});

describe("getOppositeSide", () => {
  it("flips GANA to PIERDE and back", () => {
    expect(getOppositeSide("GANA")).toBe("PIERDE");
    expect(getOppositeSide("PIERDE")).toBe("GANA");
  });
});

describe("isOwnChallenge", () => {
  it("detects when the same user id is used", () => {
    expect(isOwnChallenge("u1", "u1")).toBe(true);
    expect(isOwnChallenge("u1", "u2")).toBe(false);
  });
});

describe("createChallenge", () => {
  it("creates a pending challenge with the chosen side and amount", () => {
    const match = makeMatch();
    const duel = createChallenge(match, { id: "u1", nickname: "PanConQueso" }, "GANA", 40);
    expect(duel.status).toBe("pending");
    expect(duel.side).toBe("GANA");
    expect(duel.amount).toBe(40);
    expect(duel.creatorBet.userId).toBe("u1");
  });

  it("throws if the match already has an active duel", () => {
    const existing = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const match = makeMatch({ duel: existing });
    expect(() =>
      createChallenge(match, { id: "u2", nickname: "HornoFeroz" }, "PIERDE", 40)
    ).toThrow(BetServiceError);
  });

  it("throws for an out-of-range amount", () => {
    expect(() =>
      createChallenge(makeMatch(), { id: "u1", nickname: "PanConQueso" }, "GANA", 5)
    ).toThrow(BetServiceError);
  });
});

describe("acceptChallenge — the core 1:1 pairing rule", () => {
  it("always assigns the opposite side and the exact same amount to the second player", () => {
    const pending = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const match = makeMatch({ duel: pending });

    const paired = acceptChallenge(match, { id: "u2", nickname: "HornoFeroz" });

    expect(paired.status).toBe("paired");
    expect(paired.amount).toBe(40);
    expect(paired.ganaBet.userId).toBe("u1");
    expect(paired.pierdeBet.userId).toBe("u2");
    expect(paired.ganaBet.amount).toBe(paired.pierdeBet.amount);
  });

  it("never lets two players land on the same side", () => {
    const pending = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "PIERDE",
      25
    );
    const match = makeMatch({ duel: pending });
    const paired = acceptChallenge(match, { id: "u2", nickname: "HornoFeroz" });
    expect(paired.ganaBet.side).toBe("GANA");
    expect(paired.pierdeBet.side).toBe("PIERDE");
    expect(paired.ganaBet.side).not.toBe(paired.pierdeBet.side);
  });

  it("rejects the creator accepting their own challenge", () => {
    const pending = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const match = makeMatch({ duel: pending });
    expect(() => acceptChallenge(match, { id: "u1", nickname: "PanConQueso" })).toThrow(
      BetServiceError
    );
  });

  it("rejects accepting a match with no active challenge", () => {
    const match = makeMatch();
    expect(() => acceptChallenge(match, { id: "u2", nickname: "HornoFeroz" })).toThrow(
      BetServiceError
    );
  });

  it("rejects accepting an already-paired duel", () => {
    const pending = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const paired = acceptChallenge(makeMatch({ duel: pending }), {
      id: "u2",
      nickname: "HornoFeroz",
    });
    const match = makeMatch({ duel: paired });
    expect(() => acceptChallenge(match, { id: "u3", nickname: "Tercero" })).toThrow(
      BetServiceError
    );
  });
});

describe("pairBets", () => {
  it("throws when both bets are on the same side", () => {
    expect(() =>
      pairBets(
        { id: "b1", matchId: "m1", userId: "u1", userNickname: "A", side: "GANA", amount: 40, createdAt: "" },
        { id: "b2", matchId: "m1", userId: "u2", userNickname: "B", side: "GANA", amount: 40, createdAt: "" }
      )
    ).toThrow(BetServiceError);
  });

  it("throws when amounts differ", () => {
    expect(() =>
      pairBets(
        { id: "b1", matchId: "m1", userId: "u1", userNickname: "A", side: "GANA", amount: 40, createdAt: "" },
        { id: "b2", matchId: "m1", userId: "u2", userNickname: "B", side: "PIERDE", amount: 50, createdAt: "" }
      )
    ).toThrow(BetServiceError);
  });
});

describe("isMatchOpen / countdown de cierre", () => {
  it("is open right after creation", () => {
    const match = makeMatch({ creadoEn: new Date().toISOString(), duracionMin: 10 });
    expect(isMatchOpen(match)).toBe(true);
  });

  it("closes once duracionMin has elapsed", () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000).toISOString();
    const match = makeMatch({ creadoEn: elevenMinutesAgo, duracionMin: 10 });
    expect(isMatchOpen(match)).toBe(false);
  });

  it("rejects creating a challenge on a closed match", () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000).toISOString();
    const match = makeMatch({ creadoEn: elevenMinutesAgo, duracionMin: 10 });
    expect(() =>
      createChallenge(match, { id: "u1", nickname: "PanConQueso" }, "GANA", 40)
    ).toThrow(BetServiceError);
  });

  it("rejects accepting a challenge once the match has closed", () => {
    const pending = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000).toISOString();
    const match = makeMatch({ duel: pending, creadoEn: elevenMinutesAgo, duracionMin: 10 });
    expect(() => acceptChallenge(match, { id: "u2", nickname: "HornoFeroz" })).toThrow(
      BetServiceError
    );
  });
});

describe("resolveMatch — reparto de puntos (5 al ganador, 1 al perdedor)", () => {
  it("awards 5 points to the winning side and 1 to the losing side", () => {
    const pending = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const paired = acceptChallenge(makeMatch({ duel: pending }), {
      id: "u2",
      nickname: "HornoFeroz",
    });
    const match = makeMatch({ duel: paired });

    const { match: resolved, awards } = resolveMatch(match, "GANA");

    expect(resolved.estado).toBe("resuelto");
    expect(resolved.resultado).toBe("GANA");

    const ganaAward = awards.find((a) => a.side === "GANA");
    const pierdeAward = awards.find((a) => a.side === "PIERDE");
    expect(ganaAward?.puntos).toBe(PUNTOS_POR_GANAR);
    expect(pierdeAward?.puntos).toBe(PUNTOS_POR_PERDER);
  });

  it("flips the award when the result favors PIERDE instead", () => {
    const pending = createChallenge(
      makeMatch(),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const paired = acceptChallenge(makeMatch({ duel: pending }), {
      id: "u2",
      nickname: "HornoFeroz",
    });
    const match = makeMatch({ duel: paired });

    const { awards } = resolveMatch(match, "PIERDE");

    const ganaAward = awards.find((a) => a.side === "GANA");
    const pierdeAward = awards.find((a) => a.side === "PIERDE");
    expect(ganaAward?.puntos).toBe(PUNTOS_POR_PERDER);
    expect(pierdeAward?.puntos).toBe(PUNTOS_POR_GANAR);
  });

  it("awards nothing when the match never got a matched duel", () => {
    const match = makeMatch();
    const { awards } = resolveMatch(match, "GANA");
    expect(awards).toHaveLength(0);
  });

  it("rejects resolving an already-resolved match", () => {
    const match = makeMatch({ estado: "resuelto", resultado: "GANA" });
    expect(() => resolveMatch(match, "PIERDE")).toThrow(BetServiceError);
  });
});

describe("getUserBets", () => {
  it("separates open challenges the user created from duels they are paired in", () => {
    const pendingByUser1 = createChallenge(
      makeMatch({ id: "m1" }),
      { id: "u1", nickname: "PanConQueso" },
      "GANA",
      40
    );
    const match1 = makeMatch({ id: "m1", duel: pendingByUser1 });

    const pendingByOther = createChallenge(
      makeMatch({ id: "m2" }),
      { id: "u2", nickname: "HornoFeroz" },
      "GANA",
      25
    );
    const match2 = makeMatch({ id: "m2", duel: acceptChallenge(makeMatch({ id: "m2", duel: pendingByOther }), { id: "u1", nickname: "PanConQueso" }) });

    const { openCreated, paired } = getUserBets([match1, match2], "u1");
    expect(openCreated).toHaveLength(1);
    expect(openCreated[0].match.id).toBe("m1");
    expect(paired).toHaveLength(1);
    expect(paired[0].userSide).toBe("PIERDE");
  });
});
