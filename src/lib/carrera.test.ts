import { describe, expect, it } from "vitest";
import {
  DURACION_CARRERA_MS,
  armarCaballos,
  armarCaballosDeTickets,
  caballosEnPista,
  colorDePersona,
  faseDeCarrera,
  idDeCaballo,
  ordenEnCajon,
  perfilesDeCarrera,
  posicionCaballo,
  puestosActuales,
} from "@/lib/carrera";

/** El sorteo real: 7 personas con 4 tickets, 4 con 1, y 7 sin tickets. */
const INSCRIPCIONES = [
  ...["MrLuisElHack", "pajacosmica", "RoMeO14", "Frank95", "Faded", "Sttik", "Tronco322"].map(
    (n, i) => ({ inscripcionId: `i4-${i}`, usuarioId: `u4-${i}`, nickname: n, tickets: 4 })
  ),
  ...["JassonTod", "TSO", "samir_515_87875", "Ryse"].map((n, i) => ({
    inscripcionId: `i1-${i}`,
    usuarioId: `u1-${i}`,
    nickname: n,
    tickets: 1,
  })),
  ...["KCHERODELMAKOTO", "PanConPollo", "Amach3"].map((n, i) => ({
    inscripcionId: `i0-${i}`,
    usuarioId: `u0-${i}`,
    nickname: n,
    tickets: 0,
  })),
];

const CABALLOS = armarCaballos(INSCRIPCIONES);
const SEMILLA = "9f2b1c44-carrera";

describe("armarCaballos", () => {
  it("saca un caballo por ticket", () => {
    // 7 × 4 + 4 × 1 = 32.
    expect(CABALLOS).toHaveLength(32);
  });

  it("el que no tiene tickets no corre", () => {
    // Postgres ya los excluye con `tickets > 0`; la pista tiene que coincidir.
    expect(CABALLOS.some((c) => c.nickname === "PanConPollo")).toBe(false);
  });

  it("numera los caballos de cada persona desde 01", () => {
    const suyos = CABALLOS.filter((c) => c.nickname === "Frank95");
    expect(suyos.map((c) => c.etiqueta)).toEqual([
      "Frank95_01",
      "Frank95_02",
      "Frank95_03",
      "Frank95_04",
    ]);
  });

  it("cada caballo tiene un id único", () => {
    expect(new Set(CABALLOS.map((c) => c.id)).size).toBe(CABALLOS.length);
  });
});

describe("perfilesDeCarrera", () => {
  const ganadorId = idDeCaballo("i4-2", 3); // RoMeO14_03
  const perfiles = perfilesDeCarrera(SEMILLA, CABALLOS, ganadorId);

  it("EL GANADOR CRUZA PRIMERO, siempre", () => {
    // Es la razón de ser de todo esto: la animación no puede contradecir a
    // Postgres, que ya eligió y ya guardó al ganador.
    const finales = perfiles.map((p) => ({ id: p.caballo.id, x: posicionCaballo(p, 1) }));
    const puntero = finales.reduce((a, b) => (b.x > a.x ? b : a));
    expect(puntero.id).toBe(ganadorId);
    expect(puntero.x).toBe(1);
  });

  it("gane quien gane, la animación lo respeta", () => {
    // Se prueba con TODOS los caballos como ganador, no solo con uno.
    for (const candidato of CABALLOS) {
      const ps = perfilesDeCarrera(SEMILLA, CABALLOS, candidato.id);
      const ganador = ps.reduce((a, b) =>
        posicionCaballo(b, 1) > posicionCaballo(a, 1) ? b : a
      );
      expect(ganador.caballo.id).toBe(candidato.id);
    }
  });

  it("ningún caballo retrocede", () => {
    // Un caballo caminando para atrás rompe la ilusión más rápido que
    // cualquier otra cosa. El tope de amplitud está calculado para esto.
    for (const p of perfiles) {
      let anterior = -1;
      for (let t = 0; t <= 1; t += 0.002) {
        const x = posicionCaballo(p, t);
        expect(x).toBeGreaterThanOrEqual(anterior - 1e-9);
        anterior = x;
      }
    }
  });

  it("todos arrancan del cajón, parejos y en cero", () => {
    for (const p of perfiles) expect(posicionCaballo(p, 0)).toBe(0);
  });

  it("nadie se sale de la pista", () => {
    for (const p of perfiles) {
      for (let t = 0; t <= 1; t += 0.01) {
        const x = posicionCaballo(p, t);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it("la misma semilla dibuja la misma carrera en cualquier pantalla", () => {
    const a = perfilesDeCarrera(SEMILLA, CABALLOS, ganadorId);
    const b = perfilesDeCarrera(SEMILLA, CABALLOS, ganadorId);
    for (let i = 0; i < a.length; i++) {
      expect(posicionCaballo(a[i], 0.37)).toBe(posicionCaballo(b[i], 0.37));
      expect(a[i].carril).toBe(b[i].carril);
    }
  });

  it("otra semilla da otra carrera", () => {
    const otra = perfilesDeCarrera("semilla-distinta", CABALLOS, ganadorId);
    const iguales = otra.every(
      (p, i) => posicionCaballo(p, 0.5) === posicionCaballo(perfiles[i], 0.5)
    );
    expect(iguales).toBe(false);
  });

  it("hay adelantamientos: el que va puntero a mitad no siempre gana", () => {
    // Sin esto la carrera sería una fila india y no habría nada que mirar.
    const puntero = (t: number) =>
      perfiles.reduce((a, b) => (posicionCaballo(b, t) > posicionCaballo(a, t) ? b : a)).caballo.id;
    const momentos = [0.2, 0.4, 0.6, 0.8].map(puntero);
    expect(new Set([...momentos, ganadorId]).size).toBeGreaterThan(1);
  });

  it("cada caballo corre por un carril distinto", () => {
    expect(new Set(perfiles.map((p) => p.carril)).size).toBe(perfiles.length);
  });
});

describe("faseDeCarrera", () => {
  it("antes de la largada cuenta 3, 2, 1", () => {
    expect(faseDeCarrera(-2800)).toMatchObject({ fase: "cuenta", segundos: 3 });
    expect(faseDeCarrera(-1500)).toMatchObject({ fase: "cuenta", segundos: 2 });
    expect(faseDeCarrera(-300)).toMatchObject({ fase: "cuenta", segundos: 1 });
  });

  it("la cuenta no pasa de lo que fija el backend", () => {
    // Si 0057 y esta constante se desincronizan, la pantalla contaría hasta
    // un número que la base no respeta.
    const f = faseDeCarrera(-90_000);
    expect(f.fase === "cuenta" && f.segundos).toBeLessThanOrEqual(3);
  });

  it("a mitad de carrera devuelve el avance proporcional", () => {
    expect(faseDeCarrera(DURACION_CARRERA_MS / 2)).toEqual({ fase: "corriendo", t: 0.5 });
  });

  it("una carrera vieja se muestra terminada, sin animar", () => {
    expect(faseDeCarrera(60 * 60_000)).toEqual({ fase: "terminada", t: 1 });
  });
});

describe("armarCaballosDeTickets", () => {
  // Como llegan de la ronda: una fila por ticket comprado, en orden de compra.
  const TICKETS = [
    { id: "tk-a", usuarioId: "u1", nickname: "Ana" },
    { id: "tk-b", usuarioId: "u2", nickname: "Beto" },
    { id: "tk-c", usuarioId: "u1", nickname: "Ana" },
    { id: "tk-d", usuarioId: "u1", nickname: "Ana" },
  ];

  it("EL ID DEL CABALLO ES EL DEL TICKET", () => {
    // De esto depende encontrar al ganador: `ganador_ticket_id` apunta acá.
    expect(armarCaballosDeTickets(TICKETS).map((c) => c.id)).toEqual([
      "tk-a",
      "tk-b",
      "tk-c",
      "tk-d",
    ]);
  });

  it("numera por persona, no por orden global", () => {
    const etiquetas = armarCaballosDeTickets(TICKETS).map((c) => c.etiqueta);
    expect(etiquetas).toEqual(["Ana_01", "Beto_01", "Ana_02", "Ana_03"]);
  });

  it("saca un caballo por ticket, sin agrupar", () => {
    expect(armarCaballosDeTickets(TICKETS)).toHaveLength(4);
  });

  it("una ronda sin tickets no tiene pista", () => {
    expect(armarCaballosDeTickets([])).toEqual([]);
  });

  it("el ganador se encuentra por el id del ticket", () => {
    const caballos = armarCaballosDeTickets(TICKETS);
    const perfiles = perfilesDeCarrera("s", caballos, "tk-c");
    const primero = perfiles.reduce((a, b) =>
      posicionCaballo(b, 1) > posicionCaballo(a, 1) ? b : a
    );
    expect(primero.caballo.etiqueta).toBe("Ana_02");
  });
});

describe("caballosEnPista", () => {
  // Frank95 (4 tickets) ya ganó la primera carrera; se van a correr 3 premios.
  const conGanador = INSCRIPCIONES.map((i) => ({
    ...i,
    ganador: i.inscripcionId === "i4-3",
  }));

  it("EL QUE YA GANÓ SALE DE LA PISTA en la carrera siguiente", () => {
    // Si se quedara, se vería puntear a mitad de carrera y perder siempre:
    // Postgres ya no puede elegirlo (`and not ganador`).
    const pista = caballosEnPista(conGanador, "i4-8");
    expect(pista.some((c) => c.nickname === "Frank95")).toBe(false);
    expect(pista).toHaveLength(28); // 32 − sus 4 caballos
  });

  it("pero SÍ está mientras se muestra la carrera que ganó", () => {
    // Si no, desaparecería justo el caballo que acaba de cruzar primero.
    const pista = caballosEnPista(conGanador, "i4-3");
    expect(pista.filter((c) => c.nickname === "Frank95")).toHaveLength(4);
    expect(pista).toHaveLength(32);
  });

  it("sin ganadores todavía, corren los 32", () => {
    expect(caballosEnPista(INSCRIPCIONES.map((i) => ({ ...i, ganador: false })), null))
      .toHaveLength(32);
  });

  it("la pista se achica premio a premio", () => {
    // Tres premios: cada carrera saca a un ganador más.
    const dos = INSCRIPCIONES.map((i) => ({
      ...i,
      ganador: i.inscripcionId === "i4-3" || i.inscripcionId === "i1-1",
    }));
    // 32 − 4 (Frank95) − 1 (TSO) = 27.
    expect(caballosEnPista(dos, null)).toHaveLength(27);
  });
});

describe("ordenEnCajon", () => {
  it("no deja a los caballos de una persona todos seguidos", () => {
    // `armarCaballos` los devuelve agrupados; así la pista parecería una
    // planilla en vez de una partida.
    const enCajon = ordenEnCajon(CABALLOS);
    const seguidos = enCajon.filter(
      (c, i) => i > 0 && enCajon[i - 1].nickname === c.nickname
    ).length;
    expect(seguidos).toBeLessThan(CABALLOS.length / 2);
  });

  it("el orden no baila entre refrescos", () => {
    expect(ordenEnCajon(CABALLOS).map((c) => c.id)).toEqual(
      ordenEnCajon(CABALLOS).map((c) => c.id)
    );
  });

  it("no pierde ni repite ningún caballo", () => {
    expect(new Set(ordenEnCajon(CABALLOS).map((c) => c.id)).size).toBe(CABALLOS.length);
  });
});

describe("puestosActuales", () => {
  const ganadorId = idDeCaballo("i4-2", 3);
  const perfiles = perfilesDeCarrera(SEMILLA, CABALLOS, ganadorId);

  it("numera del 1 al último, sin repetir puesto", () => {
    const puestos = puestosActuales(perfiles, 0.5);
    expect([...puestos.values()].sort((a, b) => a - b)).toEqual(
      CABALLOS.map((_, i) => i + 1)
    );
  });

  it("al cruzar la meta, el puesto 1 es el ganador", () => {
    expect(puestosActuales(perfiles, 1).get(ganadorId)).toBe(1);
  });
});

describe("colorDePersona", () => {
  it("le da el mismo color a todos los caballos de una persona", () => {
    expect(colorDePersona("u4-0")).toBe(colorDePersona("u4-0"));
  });
});
