import { describe, expect, it } from "vitest";
import {
  URL_CHAT,
  URL_PLAYER,
  fechaInicioKick,
  formatearEspectadores,
  tiempoAlAire,
} from "@/lib/stream";

describe("fechaInicioKick", () => {
  it("lee la fecha de Kick como UTC", () => {
    // Verificado contra el reloj real: si se interpretara como hora de Lima,
    // el stream habría empezado en el futuro.
    expect(fechaInicioKick("2026-09-04 18:40:08")).toBe("2026-09-04T18:40:08.000Z");
  });

  it("aguanta que no venga nada", () => {
    expect(fechaInicioKick(null)).toBeNull();
    expect(fechaInicioKick(undefined)).toBeNull();
    expect(fechaInicioKick("")).toBeNull();
    expect(fechaInicioKick("cualquier cosa")).toBeNull();
  });
});

describe("tiempoAlAire", () => {
  const inicio = "2026-09-04T18:40:08.000Z";
  const en = (min: number) => new Date(inicio).getTime() + min * 60_000;

  it("resume en corto cuánto lleva", () => {
    expect(tiempoAlAire(inicio, en(0))).toBe("recién empezó");
    expect(tiempoAlAire(inicio, en(45))).toBe("45min");
    expect(tiempoAlAire(inicio, en(60))).toBe("1h");
    expect(tiempoAlAire(inicio, en(192))).toBe("3h 12min");
  });

  it("no inventa nada si el dato no sirve", () => {
    // Antes que mostrar "hace -2h", no mostrar nada.
    expect(tiempoAlAire(inicio, en(-120))).toBeNull();
    expect(tiempoAlAire(null, Date.now())).toBeNull();
    expect(tiempoAlAire("no es fecha", Date.now())).toBeNull();
  });
});

describe("URLs del embed", () => {
  it("el chat usa /popout, no el /chatroom viejo", () => {
    // `kick.com/<canal>/chatroom` responde 404 desde hace rato.
    expect(URL_CHAT).toContain("/popout/");
    expect(URL_CHAT).not.toContain("/chatroom");
  });

  it("el reproductor arranca muteado o el navegador no lo deja arrancar", () => {
    expect(URL_PLAYER).toContain("muted=true");
  });
});

describe("formatearEspectadores", () => {
  it("separa los miles", () => {
    expect(formatearEspectadores(341)).toBe("341");
    expect(formatearEspectadores(12_450)).toMatch(/12.450/);
  });
});
