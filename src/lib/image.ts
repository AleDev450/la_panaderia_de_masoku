const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // 25MB. Igual la reescalamos a
// MAX_WIDTH, así que esto es solo un tope contra archivos monstruo, no el
// tamaño final. Antes eran 8MB y rechazaba fotos de cámara que sí se
// podían comprimir sin problema.
const MAX_WIDTH = 1000;
const JPEG_QUALITY = 0.75;

export class ImageError extends Error {}

const MENSAJE_FORMATO =
  "No pudimos leer esa imagen. Si es una foto de iPhone (HEIC), sube una captura de pantalla o cámbiala a JPG.";
const MENSAJE_PROCESO = "No se pudo procesar la imagen. Intenta con otra captura.";

/**
 * Comprime una imagen de comprobante en el navegador (la reescala a
 * `MAX_WIDTH` y la reexporta como JPEG) antes de mandarla al servidor.
 *
 * Decodifica por dos caminos, en orden, porque el rápido falla en varios
 * teléfonos reales:
 *   1. `createImageBitmap` — rápido, pero NO lee HEIC (el formato por
 *      defecto del iPhone) y no existe en navegadores viejos (Safari < 15).
 *   2. Fallback con `<img>` — Safari/iOS SÍ decodifica HEIC dentro de un
 *      `<img>`, y funciona en navegadores sin `createImageBitmap`. Rescata
 *      justo los casos donde el camino rápido revienta.
 *
 * Si ambos fallan es un formato que este navegador no sabe leer (típico:
 * HEIC en Android/Chrome) → se lanza un `ImageError` con un mensaje claro,
 * no el genérico "No pudimos enviar tu recarga" que confundía con un error
 * de red.
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageError(
      "Ese archivo no parece una imagen. Sube una captura o foto del Yape (JPG o PNG)."
    );
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageError("La imagen es muy pesada (máximo 25MB).");
  }

  const fuente = await decodificar(file);
  try {
    const scale = Math.min(1, MAX_WIDTH / fuente.width);
    const width = Math.max(1, Math.round(fuente.width * scale));
    const height = Math.max(1, Math.round(fuente.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError(MENSAJE_PROCESO);
    ctx.drawImage(fuente.source, 0, 0, width, height);

    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
      // `toDataURL` puede fallar por límites de memoria del canvas en móviles.
      throw new ImageError(MENSAJE_PROCESO);
    }
    // Un canvas "tainted" (o un fallo silencioso) devuelve algo que no es
    // un JPEG; mejor cortar acá que subir basura que el admin no podrá ver.
    if (!dataUrl.startsWith("data:image/jpeg")) {
      throw new ImageError(MENSAJE_PROCESO);
    }
    return dataUrl;
  } finally {
    fuente.cleanup();
  }
}

interface FuenteImagen {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodificar(file: File): Promise<FuenteImagen> {
  // Camino rápido. No lee HEIC y no existe en navegadores viejos.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Cae al fallback con <img> (p.ej. HEIC en un navegador que sí lo
      // decodifica dentro de un elemento imagen).
    }
  }
  return decodificarConImg(file);
}

function decodificarConImg(file: File): Promise<FuenteImagen> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new ImageError(MENSAJE_FORMATO));
        return;
      }
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError(MENSAJE_FORMATO));
    };
    img.src = url;
  });
}
