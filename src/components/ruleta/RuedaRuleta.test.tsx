import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RuedaRuleta } from "@/components/ruleta/RuedaRuleta";
import { segmentosDeRueda } from "@/lib/ruleta";

/**
 * La rueda dibuja arcos a mano, y el caso de un solo participante es un
 * `path` degenerado (de 0° a 360° es el mismo punto). Estas pruebas cubren
 * justo eso: que se dibuje algo válido en los bordes.
 */

function segmentos(cuantos: number) {
  return segmentosDeRueda(
    Array.from({ length: cuantos }, (_, i) => ({
      usuarioId: `u${i}`,
      nickname: `Jugador${i}`,
      tickets: i + 1,
      porcentaje: 0,
      color: "#f5c518",
    }))
  );
}

describe("RuedaRuleta", () => {
  it("dibuja un sector por participante", () => {
    const { container } = render(
      <RuedaRuleta segmentos={segmentos(4)} rotacion={0} />
    );
    expect(container.querySelectorAll("path")).toHaveLength(4);
  });

  it("con un solo participante no dibuja un arco degenerado", () => {
    // De 0° a 360° los dos extremos del arco son el mismo punto y el `path`
    // sale vacío: por eso ese caso se dibuja como círculo.
    const { container } = render(
      <RuedaRuleta segmentos={segmentos(1)} rotacion={0} />
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.querySelectorAll("circle").length).toBeGreaterThan(0);
  });

  it("sin participantes no se rompe", () => {
    const { container } = render(<RuedaRuleta segmentos={[]} rotacion={0} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("todos los sectores tienen coordenadas válidas", () => {
    const { container } = render(
      <RuedaRuleta segmentos={segmentos(6)} rotacion={0} />
    );
    for (const path of container.querySelectorAll("path")) {
      expect(path.getAttribute("d")).not.toContain("NaN");
    }
  });

  it("aplica la rotación que le pasan y no una propia", () => {
    const { container } = render(
      <RuedaRuleta segmentos={segmentos(3)} rotacion={1234.5} />
    );
    const girado = container.querySelector<HTMLElement>("[style*='rotate']");
    expect(girado?.style.transform).toBe("rotate(1234.5deg)");
  });
});
