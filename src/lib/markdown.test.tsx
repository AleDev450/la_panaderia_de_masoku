import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasosNumerados, TextoConMarcas, parsearBloques } from "./markdown";

describe("parsearBloques", () => {
  it("separa los pasos por línea en blanco y toma la primera línea como título", () => {
    const bloques = parsearBloques(
      "Compra el bundle\nBrillante: 1 ticket\n\nInventario en público\nVe a ajustes."
    );
    expect(bloques).toEqual([
      { titulo: "Compra el bundle", detalle: ["Brillante: 1 ticket"] },
      { titulo: "Inventario en público", detalle: ["Ve a ajustes."] },
    ]);
  });

  it("un bloque sin detalle es solo título", () => {
    expect(parsearBloques("Solo un paso")).toEqual([{ titulo: "Solo un paso", detalle: [] }]);
  });

  it("ignora bloques vacíos y espacios sobrantes", () => {
    expect(parsearBloques("\n\n  Uno  \n\n\n   \n\nDos\n")).toEqual([
      { titulo: "Uno", detalle: [] },
      { titulo: "Dos", detalle: [] },
    ]);
  });
});

describe("TextoConMarcas", () => {
  it("renderiza negrita", () => {
    render(<TextoConMarcas texto="hola **mundo**" />);
    expect(screen.getByText("mundo").tagName).toBe("STRONG");
  });

  it("renderiza un link https con target y rel seguros", () => {
    render(<TextoConMarcas texto="ve a [Steam](https://steamcommunity.com/x)" />);
    const link = screen.getByRole("link", { name: "Steam" });
    expect(link).toHaveProperty("href", "https://steamcommunity.com/x");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("aplica la clase del color pedido", () => {
    const { container } = render(<TextoConMarcas texto="{oro:Dorado}" />);
    expect(container.querySelector("span")?.className).toContain("text-gold-light");
  });

  it("un color que no existe deja el texto sin las llaves", () => {
    const { container } = render(<TextoConMarcas texto="{turquesa:Hola}" />);
    expect(container.textContent).toBe("Hola");
  });

  it("anida color y negrita", () => {
    const { container } = render(<TextoConMarcas texto="{oro:**Dorado**}" />);
    expect(container.querySelector("span")?.className).toContain("text-gold-light");
    expect(screen.getByText("Dorado").tagName).toBe("STRONG");
  });

  // --- Seguridad: el texto lo escribe un admin, pero lo lee todo el mundo.
  it("un href javascript: NO produce un link, y queda el texto plano", () => {
    const { container } = render(<TextoConMarcas texto="[clic](javascript:alert)" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).toBe("clic");
  });

  // El paréntesis de `alert(1)` corta el match antes de tiempo, así que esto
  // ni siquiera llega a parsearse como link — pero se deja fijado: lo que
  // importa es que no salga un <a> con ese href, no por qué camino.
  it("tampoco produce link con un payload que trae paréntesis", () => {
    const { container } = render(<TextoConMarcas texto="[clic](javascript:alert(1))" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).toContain("clic");
    expect(container.textContent).not.toContain("javascript:");
  });

  it("un href data: tampoco produce un link", () => {
    render(<TextoConMarcas texto="[x](data:text/html,<script>alert(1)</script>)" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("el HTML escrito a mano queda como texto, no como etiquetas", () => {
    const { container } = render(
      <TextoConMarcas texto={'<img src=x onerror="alert(1)"> y <b>negrita</b>'} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });

  it("deja intacto el texto sin marcas", () => {
    const { container } = render(<TextoConMarcas texto="Brillante: 1 ticket | Dorado: 3" />);
    expect(container.textContent).toBe("Brillante: 1 ticket | Dorado: 3");
  });
});

describe("PasosNumerados", () => {
  it("numera los pasos desde 1", () => {
    render(<PasosNumerados bloques={parsearBloques("Uno\n\nDos\n\nTres")} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("4")).toBeNull();
  });
});
