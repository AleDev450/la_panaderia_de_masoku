const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // 8MB antes de comprimir
const MAX_WIDTH = 1000;
const JPEG_QUALITY = 0.75;

export class ImageError extends Error {}

/**
 * Comprime una imagen de comprobante en el navegador (redimensiona a
 * `MAX_WIDTH` y reexporta como JPEG) antes de guardarla como data URL en
 * localStorage — sin esto, un par de fotos de cámara agotan la cuota del
 * navegador en pocas recargas.
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageError("El comprobante debe ser una imagen.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageError("La imagen es muy pesada (máximo 8MB).");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
