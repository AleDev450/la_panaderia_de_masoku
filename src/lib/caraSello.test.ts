import { describe, expect, it } from "vitest";
import {
  VUELTAS_MONEDA,
  comisionDelDuelo,
  gananciaNeta,
  ladoDe,
  pagoCaraSello,
  rotacionFinalMoneda,
} from "@/lib/caraSello";

const sala = {
  creador_id: "creador",
  rival_id: "rival",
  lado_creador: "cara" as const,
};

describe("pagoCaraSello", () => {
  it("paga el multiplicador sobre lo apostado", () => {
    expect(pagoCaraSello(10, 1.8)).toBe(18);
    expect(pagoCaraSello(5, 1.8)).toBe(9);
    expect(pagoCaraSello(100, 1.8)).toBe(180);
  });

  it("redondea a 2 decimales, como el RPC", () => {
    // 15 * 1.8 y 12.35 * 1.8 son los clásicos que se van en flotante.
    expect(pagoCaraSello(15, 1.8)).toBe(27);
    expect(pagoCaraSello(12.35, 1.8)).toBe(22.23);
  });
});

describe("gananciaNeta", () => {
  it("es lo que suma al saldo, no el pago entero", () => {
    // Ganar 1.8x sobre 10 deja +8: los otros 10 ya eran tuyos.
    expect(gananciaNeta(10, 18)).toBe(8);
  });

  it("perder es perder lo apostado", () => {
    expect(gananciaNeta(10, 0)).toBe(-10);
  });
});

describe("ladoDe", () => {
  it("el creador juega con el lado que eligió", () => {
    expect(ladoDe(sala, "creador")).toBe("cara");
  });

  it("al que se sienta enfrente le toca el contrario, siempre", () => {
    expect(ladoDe(sala, "rival")).toBe("sello");
    expect(ladoDe({ ...sala, lado_creador: "sello" }, "rival")).toBe("cara");
  });

  it("quien no juega en esa sala no tiene lado", () => {
    expect(ladoDe(sala, "mirón")).toBeNull();
    expect(ladoDe({ ...sala, rival_id: null }, "mirón")).toBeNull();
  });
});

describe("comisionDelDuelo", () => {
  it("con 1.8x la casa se queda 0.20 por sol apostado", () => {
    // Los dos ponen 10 → pozo 20, premio 18, casa 2 = 0.20 * 10.
    expect(comisionDelDuelo(10, 1.8)).toBe(2);
    expect(comisionDelDuelo(50, 1.8)).toBe(10);
  });

  it("el premio y la comisión siempre suman el pozo entero", () => {
    for (const monto of [5, 12.35, 33.33, 99.99]) {
      const pozo = Math.round(monto * 2 * 100) / 100;
      const reparto = pagoCaraSello(monto, 1.8) + comisionDelDuelo(monto, 1.8);
      expect(Math.round(reparto * 100) / 100).toBe(pozo);
    }
  });

  it("la casa gana lo mismo salga cara o sello: no corre riesgo", () => {
    // El premio no depende del resultado, así que la comisión tampoco.
    expect(comisionDelDuelo(20, 1.8)).toBe(comisionDelDuelo(20, 1.8));
    expect(comisionDelDuelo(20, 1.8)).toBeGreaterThan(0);
  });
});

describe("rotacionFinalMoneda", () => {
  it("cara queda de frente y sello a media vuelta", () => {
    expect(rotacionFinalMoneda("cara") % 360).toBe(0);
    expect(rotacionFinalMoneda("sello") % 360).toBe(180);
  });

  it("da varias vueltas antes de frenar", () => {
    expect(rotacionFinalMoneda("cara")).toBe(VUELTAS_MONEDA * 360);
  });

  it("el ángulo final ES el resultado: no puede mostrar otra cosa", () => {
    // Si esto se rompe, la animación podría terminar enseñando una cara
    // distinta a la que devolvió el backend.
    for (const base of [0, 360, 1800, 3600]) {
      expect((base + rotacionFinalMoneda("sello")) % 360).toBe(180);
      expect((base + rotacionFinalMoneda("cara")) % 360).toBe(0);
    }
  });
});
