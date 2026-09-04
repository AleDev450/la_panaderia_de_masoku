import { describe, expect, it } from "vitest";
import {
  CUENTA_REGRESIVA_MS,
  DURACION_GIRO_MS,
  ParticipanteRonda,
  centroDelSegmento,
  curvaDeGiro,
  faseDeGiro,
  comisionMaxima,
  montosRapidos,
  porcentajeDeParticipacion,
  premioMinimo,
  repartoParaGanador,
  rotacionFinal,
  segmentosDeRueda,
  ticketsPorMonto,
} from "@/lib/ruleta";

function participante(overrides: Partial<ParticipanteRonda> = {}): ParticipanteRonda {
  return {
    usuarioId: "u1",
    nickname: "Jugador",
    tickets: 1,
    porcentaje: 0,
    color: "#f5c518",
    ...overrides,
  };
}

describe("ticketsPorMonto", () => {
  it("da un ticket por cada precio completo", () => {
    expect(ticketsPorMonto(3, 3)).toBe(1);
    expect(ticketsPorMonto(6, 3)).toBe(2);
    expect(ticketsPorMonto(9, 3)).toBe(3);
    expect(ticketsPorMonto(15, 3)).toBe(5);
    expect(ticketsPorMonto(30, 3)).toBe(10);
  });

  it("rechaza lo que no es múltiplo exacto en vez de quedarse con el vuelto", () => {
    expect(ticketsPorMonto(4, 3)).toBeNull();
    expect(ticketsPorMonto(10, 3)).toBeNull();
    expect(ticketsPorMonto(3.5, 3)).toBeNull();
  });

  it("no se rompe con la coma flotante", () => {
    // 0.1 + 0.2 !== 0.3 también arruina un módulo: por eso se compara en
    // céntimos enteros y no con `%` sobre decimales.
    expect(ticketsPorMonto(0.3, 0.1)).toBe(3);
    expect(ticketsPorMonto(2.5, 0.5)).toBe(5);
  });

  it("rechaza montos inválidos", () => {
    expect(ticketsPorMonto(0, 3)).toBeNull();
    expect(ticketsPorMonto(-3, 3)).toBeNull();
    expect(ticketsPorMonto(Number.NaN, 3)).toBeNull();
  });
});

describe("montosRapidos", () => {
  it("con ticket de S/3 son los montos del enunciado", () => {
    expect(montosRapidos(3)).toEqual([3, 6, 9, 15, 30]);
  });

  it("siguen siendo múltiplos si cambia el precio", () => {
    for (const monto of montosRapidos(2.5)) {
      expect(ticketsPorMonto(monto, 2.5)).not.toBeNull();
    }
  });
});

describe("repartoParaGanador", () => {
  it("el ganador recupera lo suyo y se lleva el 80% de lo ajeno", () => {
    // A puso 39 de un pozo de 42: recupera 39 + 80% de los 3 ajenos.
    expect(repartoParaGanador(39, 42, 80)).toEqual({ premio: 41.4, comision: 0.6 });
    // B puso 3: recupera 3 + 80% de los 39 ajenos.
    expect(repartoParaGanador(3, 42, 80)).toEqual({ premio: 34.2, comision: 7.8 });
  });

  it("NADIE PUEDE PERDER GANANDO", () => {
    // Es la razón de ser de 0051: antes, quien ponía más del 80% del pozo
    // cobraba menos de lo que había puesto.
    for (const [aporte, pozo] of [
      [39, 42],
      [99, 100],
      [50, 50],
      [0.03, 100],
      [980, 1000],
    ]) {
      const { premio } = repartoParaGanador(aporte, pozo, 80);
      expect(premio).toBeGreaterThanOrEqual(aporte);
    }
  });

  it("la casa nunca pone plata suya", () => {
    for (const [aporte, pozo] of [
      [39, 42],
      [50, 50],
      [0, 30],
      [12.35, 61.75],
    ]) {
      expect(repartoParaGanador(aporte, pozo, 80).comision).toBeGreaterThanOrEqual(0);
    }
  });

  it("las dos partes siempre suman el pozo, aunque haya céntimos", () => {
    for (const [aporte, pozo] of [
      [33.33, 100.01],
      [0.05, 7.77],
      [1, 999.99],
      [0, 43],
    ]) {
      const { premio, comision } = repartoParaGanador(aporte, pozo, 80);
      expect(Math.round((premio + comision) * 100) / 100).toBe(pozo);
    }
  });

  it("con un solo participante recupera todo y la casa no cobra", () => {
    // No hay a quién ganarle: su plata vuelve entera.
    expect(repartoParaGanador(30, 30, 80)).toEqual({ premio: 30, comision: 0 });
  });

  it("un pozo vacío no reparte nada", () => {
    expect(repartoParaGanador(0, 0, 80)).toEqual({ premio: 0, comision: 0 });
  });
});

describe("premioMinimo y comisionMaxima", () => {
  it("son las cotas de lo que puede pasar antes de saber quién gana", () => {
    expect(premioMinimo(42, 80)).toBe(33.6);
    expect(comisionMaxima(42, 80)).toBe(8.4);
  });

  it("ningún reparto real se sale de esas cotas", () => {
    const pozo = 42;
    for (const aporte of [0, 3, 12, 39, 42]) {
      const { premio, comision } = repartoParaGanador(aporte, pozo, 80);
      expect(premio).toBeGreaterThanOrEqual(premioMinimo(pozo, 80));
      expect(comision).toBeLessThanOrEqual(comisionMaxima(pozo, 80));
    }
  });
});

describe("porcentajeDeParticipacion", () => {
  it("es la proporción de tickets, con un decimal", () => {
    expect(porcentajeDeParticipacion(1, 100)).toBe(1);
    expect(porcentajeDeParticipacion(10, 100)).toBe(10);
    expect(porcentajeDeParticipacion(84, 100)).toBe(84);
    expect(porcentajeDeParticipacion(1, 3)).toBe(33.3);
  });

  it("sin tickets en la ronda es 0 y no una división por cero", () => {
    expect(porcentajeDeParticipacion(0, 0)).toBe(0);
  });
});

describe("segmentosDeRueda", () => {
  it("reparte la rueda proporcionalmente a los tickets", () => {
    const segmentos = segmentosDeRueda([
      participante({ usuarioId: "a", tickets: 1 }),
      participante({ usuarioId: "b", tickets: 3 }),
    ]);

    expect(segmentos[0].desde).toBe(0);
    expect(segmentos[0].hasta).toBe(90);
    expect(segmentos[1].desde).toBe(90);
    expect(segmentos[1].hasta).toBe(360);
  });

  it("el que tiene diez veces más tickets ocupa diez veces más arco", () => {
    const [uno, diez] = segmentosDeRueda([
      participante({ usuarioId: "a", tickets: 1 }),
      participante({ usuarioId: "b", tickets: 10 }),
    ]);

    expect(diez.hasta - diez.desde).toBeCloseTo((uno.hasta - uno.desde) * 10);
  });

  it("cierra exactamente en 360 aunque los tickets no dividan redondo", () => {
    const segmentos = segmentosDeRueda([
      participante({ usuarioId: "a", tickets: 1 }),
      participante({ usuarioId: "b", tickets: 1 }),
      participante({ usuarioId: "c", tickets: 1 }),
    ]);

    expect(segmentos.at(-1)!.hasta).toBe(360);
  });

  it("sin tickets no hay rueda que dibujar", () => {
    expect(segmentosDeRueda([])).toEqual([]);
    expect(segmentosDeRueda([participante({ tickets: 0 })])).toEqual([]);
  });
});

describe("faseDeGiro", () => {
  const anguloGanador = 90;
  const destino = rotacionFinal(anguloGanador);

  it("antes del inicio muestra la cuenta regresiva", () => {
    expect(faseDeGiro(-2500, anguloGanador)).toEqual({
      fase: "cuenta",
      segundos: 3,
      rotacion: 0,
    });
    expect(faseDeGiro(-500, anguloGanador)).toMatchObject({ fase: "cuenta", segundos: 1 });
  });

  it("la cuenta nunca pasa de los segundos que fija el backend", () => {
    // Un cliente que llegó muy temprano no debería ver "8, 7, 6…".
    const fase = faseDeGiro(-30_000, anguloGanador);
    expect(fase.fase).toBe("cuenta");
    expect(fase.fase === "cuenta" && fase.segundos).toBeLessThanOrEqual(
      CUENTA_REGRESIVA_MS / 1000
    );
  });

  it("al terminar frena exactamente en el ganador", () => {
    expect(faseDeGiro(DURACION_GIRO_MS, anguloGanador)).toEqual({
      fase: "terminado",
      rotacion: destino,
    });
    expect(faseDeGiro(DURACION_GIRO_MS + 60_000, anguloGanador)).toEqual({
      fase: "terminado",
      rotacion: destino,
    });
  });

  it("el ángulo final deja al ganador bajo la flecha", () => {
    // La flecha está arriba (0°) y la rueda gira en sentido horario: el
    // ganador queda ahí cuando la rotación compensa su ángulo.
    expect((destino + anguloGanador) % 360).toBe(0);
  });

  it("dos pantallas que se enteraron en momentos distintos dibujan lo mismo", () => {
    // Este es el corazón de la sincronización: la fase depende SOLO del
    // tiempo transcurrido desde la marca del servidor, así que dos clientes
    // que preguntan por el mismo instante obtienen el mismo frame — sin
    // importar cuándo se enteraron de que había que girar.
    const instante = 4200;
    expect(faseDeGiro(instante, anguloGanador)).toEqual(faseDeGiro(instante, anguloGanador));
  });

  it("avanza sin retroceder mientras gira", () => {
    let anterior = -1;
    for (let t = 0; t <= DURACION_GIRO_MS; t += 500) {
      const fase = faseDeGiro(t, anguloGanador);
      expect(fase.rotacion).toBeGreaterThanOrEqual(anterior);
      anterior = fase.rotacion;
    }
  });
});

describe("curvaDeGiro", () => {
  const tramo = (a: number, b: number) => curvaDeGiro(b) - curvaDeGiro(a);

  it("arranca en cero y termina completa", () => {
    expect(curvaDeGiro(0)).toBe(0);
    expect(curvaDeGiro(1)).toBe(1);
  });

  it("el empujón es corto: no se queda medio giro quieta", () => {
    // La curva anterior (smootherstep) avanzaba 0.9% en el primer 10% del
    // tiempo y por eso se veía pesada.
    expect(curvaDeGiro(0.1)).toBeGreaterThan(0.15);
  });

  it("después del impulso no hace más que frenar", () => {
    const tramos = [
      tramo(0.2, 0.35),
      tramo(0.35, 0.5),
      tramo(0.5, 0.65),
      tramo(0.65, 0.8),
      tramo(0.8, 0.95),
    ];
    for (let i = 1; i < tramos.length; i++) {
      expect(tramos[i]).toBeLessThan(tramos[i - 1]);
    }
  });

  it("arranca como un borrón y llega lenta: el contraste es el efecto", () => {
    // La gracia es que al principio NO se lean los nombres y sí se lean
    // cuando frena. Si alguien vuelve a suavizar la curva, esto lo atrapa.
    const alPrincipio = tramo(0, 0.1);
    const alFinal = tramo(0.9, 1);
    expect(alPrincipio).toBeGreaterThan(alFinal * 20);
    // Y tiene que quedar una cola lenta de verdad, no un frenazo seco.
    expect(alFinal).toBeLessThan(0.01);
  });

  it("a mitad de tiempo ya recorrió la mayor parte", () => {
    // Esto es lo que la hace ver rápida: el grueso del giro pasa temprano y
    // el final se arrastra despacio hasta el ganador.
    expect(curvaDeGiro(0.5)).toBeGreaterThan(0.7);
  });

  it("el tramo final es el más lento de todos", () => {
    expect(tramo(0.9, 1)).toBeLessThan(tramo(0.4, 0.5));
  });

  it("no se sale de rango si le llega basura", () => {
    expect(curvaDeGiro(-3)).toBe(0);
    expect(curvaDeGiro(9)).toBe(1);
  });
});

describe("centroDelSegmento", () => {
  it("apunta al medio del arco", () => {
    const [primero] = segmentosDeRueda([
      participante({ usuarioId: "a", tickets: 1 }),
      participante({ usuarioId: "b", tickets: 1 }),
    ]);
    expect(centroDelSegmento(primero)).toBe(90);
  });
});
