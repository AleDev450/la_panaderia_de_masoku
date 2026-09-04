import { describe, expect, it } from "vitest";
import {
  CUENTA_REGRESIVA_MONEDA_MS,
  DURACION_MONEDA_MS,
  VUELTAS_MONEDA,
  comisionDelDuelo,
  faseDeLanzamiento,
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

describe("faseDeLanzamiento", () => {
  it("antes del lanzamiento muestra la cuenta regresiva", () => {
    expect(faseDeLanzamiento(-2500, "cara")).toEqual({
      fase: "cuenta",
      segundos: 3,
      rotacion: 0,
    });
    expect(faseDeLanzamiento(-400, "sello")).toMatchObject({ fase: "cuenta", segundos: 1 });
  });

  it("la cuenta nunca pasa de los segundos que fija el backend", () => {
    const fase = faseDeLanzamiento(-45_000, "cara");
    expect(fase.fase).toBe("cuenta");
    expect(fase.fase === "cuenta" && fase.segundos).toBeLessThanOrEqual(
      CUENTA_REGRESIVA_MONEDA_MS / 1000
    );
  });

  it("termina exactamente en la cara que mandó el backend", () => {
    // Si esto se rompe, la animación podría terminar enseñando el lado
    // contrario al que se pagó.
    for (const [resultado, resto] of [
      ["cara", 0],
      ["sello", 180],
    ] as const) {
      const fase = faseDeLanzamiento(DURACION_MONEDA_MS, resultado);
      expect(fase.fase).toBe("terminado");
      expect(fase.rotacion % 360).toBe(resto);
    }
  });

  it("una mesa vieja se muestra ya caída, sin animar", () => {
    expect(faseDeLanzamiento(60 * 60_000, "sello")).toEqual({
      fase: "terminado",
      rotacion: rotacionFinalMoneda("sello"),
    });
  });

  it("dos pantallas que se enteraron en momentos distintos dibujan lo mismo", () => {
    // Depende SOLO del tiempo transcurrido desde la marca del servidor, así
    // que preguntando por el mismo instante da el mismo frame.
    const instante = 1200;
    expect(faseDeLanzamiento(instante, "cara")).toEqual(faseDeLanzamiento(instante, "cara"));
  });

  it("avanza sin retroceder mientras gira", () => {
    let anterior = -1;
    for (let t = 0; t <= DURACION_MONEDA_MS; t += 100) {
      const fase = faseDeLanzamiento(t, "sello");
      expect(fase.rotacion).toBeGreaterThanOrEqual(anterior);
      anterior = fase.rotacion;
    }
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
