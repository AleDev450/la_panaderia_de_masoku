import { describe, expect, it } from "vitest";
import {
  VUELTAS_MONEDA,
  gananciaNeta,
  pagoCaraSello,
  rotacionFinalMoneda,
} from "@/lib/caraSello";

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
