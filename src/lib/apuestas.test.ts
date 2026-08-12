import { describe, expect, it } from "vitest";
import { CUOTA, liquidacionDeApuesta } from "@/lib/apuestas";
import { Apuesta, Evento } from "@/lib/supabase/types";

function evento(overrides: Partial<Evento> = {}): Evento {
  return {
    id: "e1",
    nombre: "¿Horno Real gana la serie?",
    lado_a: "GANA",
    lado_b: "PIERDE",
    estado: "resuelto",
    resultado: "a",
    categoria: "dota2",
    cierra_en: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function apuesta(overrides: Partial<Apuesta> = {}): Apuesta {
  return {
    id: "a1",
    evento_id: "e1",
    usuario_id: "u1",
    lado: "a",
    monto_total: 100,
    monto_matcheado: 100,
    // resolver_evento deja esto en 0 al liquidar — ver el test de "devuelto".
    monto_pendiente: 0,
    estado: "completa",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("liquidacionDeApuesta", () => {
  it("devuelve null mientras el evento no esté resuelto", () => {
    expect(liquidacionDeApuesta(apuesta(), evento({ estado: "abierto", resultado: null }))).toBeNull();
    expect(liquidacionDeApuesta(apuesta(), evento({ estado: "cerrado", resultado: null }))).toBeNull();
  });

  it("paga cuota 1.80 sobre lo emparejado al lado que acertó", () => {
    const liq = liquidacionDeApuesta(apuesta({ lado: "a" }), evento({ resultado: "a" }));
    expect(liq).toEqual({ gano: true, cobrado: 180, perdido: 0, devuelto: 0 });
    expect(liq!.cobrado).toBe(100 * CUOTA);
  });

  it("pierde lo emparejado el lado que no acertó", () => {
    const liq = liquidacionDeApuesta(apuesta({ lado: "b" }), evento({ resultado: "a" }));
    expect(liq).toEqual({ gano: false, cobrado: 0, perdido: 100, devuelto: 0 });
  });

  it("calcula lo devuelto como monto_total - monto_matcheado, no desde monto_pendiente", () => {
    // Caso real tras resolver_evento: apostó 100, solo se cubrieron 40, y la
    // función SQL ya puso monto_pendiente en 0 al devolver los 60 restantes.
    // Leer monto_pendiente aquí daría 0 y ocultaría la devolución.
    const liq = liquidacionDeApuesta(
      apuesta({ monto_total: 100, monto_matcheado: 40, monto_pendiente: 0 }),
      evento({ resultado: "a" })
    );
    expect(liq).toEqual({ gano: true, cobrado: 72, perdido: 0, devuelto: 60 });
  });

  it("redondea el pago a 2 decimales", () => {
    const liq = liquidacionDeApuesta(
      apuesta({ monto_total: 15, monto_matcheado: 15 }),
      evento({ resultado: "a" })
    );
    // 15 * 1.8 = 27.000000000000004 en coma flotante si no se redondea.
    expect(liq!.cobrado).toBe(27);
  });

  it("una apuesta que nunca emparejó no cobra ni pierde: se devuelve entera", () => {
    const liq = liquidacionDeApuesta(
      apuesta({ monto_total: 50, monto_matcheado: 0, monto_pendiente: 0, estado: "cancelada" }),
      evento({ resultado: "b" })
    );
    expect(liq).toEqual({ gano: false, cobrado: 0, perdido: 0, devuelto: 50 });
  });
});
