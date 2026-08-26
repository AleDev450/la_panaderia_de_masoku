import { describe, expect, it } from "vitest";
import { columna, construirXlsx, crc32 } from "./xlsx";

/** Las entradas van sin comprimir, así que el XML aparece literal en los
 * bytes y se puede revisar sin descomprimir nada. */
function comoTexto(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

describe("crc32", () => {
  it("coincide con el vector conocido de '123456789'", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("el CRC de vacío es 0", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("columna", () => {
  it("mapea el índice a letra de columna de Excel", () => {
    expect(columna(0)).toBe("A");
    expect(columna(25)).toBe("Z");
    expect(columna(26)).toBe("AA");
    expect(columna(51)).toBe("AZ");
    expect(columna(52)).toBe("BA");
  });
});

describe("construirXlsx", () => {
  const libro = () =>
    construirXlsx([
      {
        nombre: "Dia a dia",
        encabezados: ["Fecha", "Ingreso (S/)"],
        filas: [["2026-08-24", 34.5]],
      },
      {
        nombre: "Saldos de jugadores",
        encabezados: ["Jugador", "Le debes (S/)"],
        filas: [["PanConPollo", 116]],
      },
    ]);

  it("empieza con la firma de un ZIP", () => {
    const bytes = libro();
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("cierra con el end-of-central-directory", () => {
    const bytes = libro();
    const fin = bytes.slice(bytes.length - 22, bytes.length - 18);
    expect([fin[0], fin[1], fin[2], fin[3]]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("trae las partes obligatorias de un xlsx", () => {
    const texto = comoTexto(libro());
    for (const parte of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]) {
      expect(texto).toContain(parte);
    }
  });

  it("declara una pestaña por hoja, con su nombre", () => {
    const texto = comoTexto(libro());
    expect(texto).toContain('<sheet name="Dia a dia" sheetId="1" r:id="rId1"/>');
    expect(texto).toContain('<sheet name="Saldos de jugadores" sheetId="2" r:id="rId2"/>');
  });

  it("escribe los números como número y el texto como texto", () => {
    const texto = comoTexto(libro());
    // Sumable en Excel: sin t="inlineStr".
    expect(texto).toContain('<c r="B2"><v>34.5</v></c>');
    expect(texto).toContain(">2026-08-24<");
  });

  it("pone el encabezado con el estilo en negrita", () => {
    expect(comoTexto(libro())).toContain('<c r="A1" s="1" t="inlineStr">');
  });

  it("escapa los caracteres que romperían el XML", () => {
    const texto = comoTexto(
      construirXlsx([
        { nombre: "H", encabezados: ["A"], filas: [['Pan & <Pollo> "x"']] },
      ])
    );
    expect(texto).toContain("Pan &amp; &lt;Pollo&gt; &quot;x&quot;");
    expect(texto).not.toContain("<Pollo>");
  });

  it("recorta el nombre de hoja a 31 y saca los caracteres prohibidos", () => {
    const texto = comoTexto(
      construirXlsx([
        { nombre: "Saldos/de[jugadores]:a*b?c con un nombre larguísimo", encabezados: ["A"], filas: [] },
      ])
    );
    const nombre = /<sheet name="([^"]*)"/.exec(texto)?.[1] ?? "";
    expect(nombre.length).toBeLessThanOrEqual(31);
    expect(nombre).not.toMatch(/[[\]:*?/\\]/);
  });

  it("una hoja sin filas sigue siendo un archivo válido", () => {
    const bytes = construirXlsx([{ nombre: "Vacía", encabezados: ["A", "B"], filas: [] }]);
    expect(bytes.length).toBeGreaterThan(0);
    expect(comoTexto(bytes)).toContain("<sheetData><row r=\"1\">");
  });

  it("rechaza un libro sin hojas en vez de escribir algo que Excel no abre", () => {
    expect(() => construirXlsx([])).toThrow();
  });
});
