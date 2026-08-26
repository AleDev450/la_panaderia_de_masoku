/**
 * Escritor mínimo de .xlsx — un libro de Excel de verdad, con pestañas.
 *
 * POR QUÉ A MANO Y NO CON UNA LIBRERÍA. Lo que se necesita es angosto:
 * varias hojas, encabezado en negrita y celdas numéricas. `xlsx` (SheetJS)
 * en npm está congelado en una versión con una vulnerabilidad publicada, y
 * `exceljs` pesa cerca de un mega para un botón de descarga. Un .xlsx es
 * un ZIP con unos XML adentro, y sin compresión (método "stored", que el
 * formato permite) el ZIP se arma en unas pocas decenas de líneas.
 *
 * POR QUÉ .xlsx Y NO .xls. `.xls` es el binario viejo (BIFF), que no se
 * escribe a mano de forma razonable. Excel abre este archivo igual — es su
 * formato nativo desde 2007 — pero si se le pusiera extensión .xls saldría
 * el aviso de "el formato y la extensión no coinciden" en cada apertura.
 */

export interface HojaExcel {
  /** Nombre de la pestaña. Excel corta en 31 caracteres y prohíbe []:*?/\ */
  nombre: string;
  encabezados: string[];
  /** Los números se escriben como números (se pueden sumar en Excel); el
   * resto va como texto. */
  filas: (string | number)[][];
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rechaza el archivo entero si aparece un carácter de control.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** 0 → A, 25 → Z, 26 → AA. Exportada para poder testearla suelta. */
export function columna(indice: number): string {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

function celda(ref: string, valor: string | number, negrita: boolean): string {
  const estilo = negrita ? ' s="1"' : "";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${ref}"${estilo}><v>${valor}</v></c>`;
  }
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${esc(String(valor))}</t></is></c>`;
}

function hojaXml(hoja: HojaExcel): string {
  const filas: string[] = [];

  filas.push(
    `<row r="1">${hoja.encabezados
      .map((h, i) => celda(`${columna(i)}1`, h, true))
      .join("")}</row>`
  );

  hoja.filas.forEach((fila, f) => {
    const n = f + 2;
    filas.push(
      `<row r="${n}">${fila.map((v, i) => celda(`${columna(i)}${n}`, v, false)).join("")}</row>`
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${filas.join("")}</sheetData>` +
    `</worksheet>`
  );
}

/** Solo lo justo para tener el encabezado en negrita (cellXfs[1]). */
const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  // Excel espera estos dos rellenos en este orden aunque no se usen.
  `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `</styleSheet>`;

/** Excel corta en 31 y revienta con []:*?/\ — se limpia acá y no en quien llama. */
function nombreHoja(nombre: string, indice: number): string {
  const limpio = nombre.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return limpio || `Hoja ${indice + 1}`;
}

// ---------------------------------------------------------------------------
// ZIP (método "stored": sin comprimir, que el formato permite)
// ---------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

/** Exportada para testearla contra vectores conocidos: un CRC mal
 * calculado hace que Excel declare el archivo dañado, y ese error no dice
 * dónde está el problema. */
export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entrada {
  nombre: string;
  datos: Uint8Array;
  crc: number;
  offset: number;
}

function u16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function zip(archivos: { nombre: string; texto: string }[]): Uint8Array {
  const codificador = new TextEncoder();
  const partes: number[] = [];
  const entradas: Entrada[] = [];

  for (const archivo of archivos) {
    const datos = codificador.encode(archivo.texto);
    const nombre = codificador.encode(archivo.nombre);
    const crc = crc32(datos);
    const offset = partes.length;

    partes.push(
      ...u32(0x04034b50),
      ...u16(20), // versión necesaria
      ...u16(0), // flags
      ...u16(0), // sin compresión
      ...u16(0), // hora
      ...u16(0), // fecha
      ...u32(crc),
      ...u32(datos.length),
      ...u32(datos.length),
      ...u16(nombre.length),
      ...u16(0) // sin campo extra
    );
    partes.push(...nombre, ...datos);

    entradas.push({ nombre: archivo.nombre, datos, crc, offset });
  }

  const inicioDirectorio = partes.length;
  for (const entrada of entradas) {
    const nombre = codificador.encode(entrada.nombre);
    partes.push(
      ...u32(0x02014b50),
      ...u16(20), // versión de creación
      ...u16(20), // versión necesaria
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(entrada.crc),
      ...u32(entrada.datos.length),
      ...u32(entrada.datos.length),
      ...u16(nombre.length),
      ...u16(0), // extra
      ...u16(0), // comentario
      ...u16(0), // disco
      ...u16(0), // atributos internos
      ...u32(0), // atributos externos
      ...u32(entrada.offset)
    );
    partes.push(...nombre);
  }

  partes.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entradas.length),
    ...u16(entradas.length),
    ...u32(partes.length - inicioDirectorio),
    ...u32(inicioDirectorio),
    ...u16(0)
  );

  return Uint8Array.from(partes);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";

/** Arma el libro. Devuelve los bytes del .xlsx. */
export function construirXlsx(hojas: HojaExcel[]): Uint8Array {
  if (hojas.length === 0) throw new Error("Un libro necesita al menos una hoja.");

  const nombres = hojas.map((h, i) => nombreHoja(h.nombre, i));

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="${NS_CT}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    hojas
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("") +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_REL}">` +
    `<sheets>` +
    nombres
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("") +
    `</sheets></workbook>`;

  // Los estilos van con el id siguiente al de la última hoja.
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    hojas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${hojas.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return zip([
    { nombre: "[Content_Types].xml", texto: contentTypes },
    { nombre: "_rels/.rels", texto: rels },
    { nombre: "xl/workbook.xml", texto: workbook },
    { nombre: "xl/_rels/workbook.xml.rels", texto: workbookRels },
    { nombre: "xl/styles.xml", texto: STYLES_XML },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      texto: hojaXml(h),
    })),
  ]);
}

/** Arma el libro y dispara la descarga en el navegador. */
export function descargarXlsx(nombreArchivo: string, hojas: HojaExcel[]) {
  const bytes = construirXlsx(hojas);
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
