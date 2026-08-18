import { describe, it, expect } from "vitest";
import { registerPlayerSchema } from "./auth";

const base = {
  email: "juan@example.com",
  password: "Prueba1234",
  nickname: "juan_23",
  fullName: "Juan Pérez",
  phone: "987654321",
};

describe("registerPlayerSchema (validación del servidor)", () => {
  it("acepta datos válidos", () => {
    expect(registerPlayerSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza un nombre con <script> (intento de inyección)", () => {
    const r = registerPlayerSchema.safeParse({
      ...base,
      fullName: '<script>console.log("holaaaa");</script>',
    });
    expect(r.success).toBe(false);
  });

  it("rechaza nombres con < o >", () => {
    expect(registerPlayerSchema.safeParse({ ...base, fullName: "a<b" }).success).toBe(false);
    expect(registerPlayerSchema.safeParse({ ...base, fullName: "a>b" }).success).toBe(false);
  });

  it("rechaza nickname con caracteres fuera de [a-zA-Z0-9_]", () => {
    expect(registerPlayerSchema.safeParse({ ...base, nickname: "<b>x</b>" }).success).toBe(false);
  });

  it("rechaza teléfono que no sea 9 dígitos", () => {
    expect(registerPlayerSchema.safeParse({ ...base, phone: "abc" }).success).toBe(false);
    expect(registerPlayerSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });

  it("recorta espacios (trim) en el nombre y el nickname", () => {
    const r = registerPlayerSchema.safeParse({ ...base, fullName: "  Juan Pérez  " });
    expect(r.success && r.data.fullName).toBe("Juan Pérez");
  });
});
