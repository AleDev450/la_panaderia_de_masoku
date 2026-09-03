import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Favicon generado a partir del isotipo real (`public/images/brand/iso.png`).
 *
 * No se sirve el PNG directo como icono: el arte es blanco sobre
 * transparente, así que en una pestaña de navegador en modo claro
 * desaparecería. Acá se compone sobre el negro de marca, que es como se
 * diseñó para verse.
 *
 * Se genera en build (Next lo cachea), no en cada request.
 */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const iso = await readFile(join(process.cwd(), "public/images/brand/iso.png"));
  const dataUri = `data:image/png;base64,${iso.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050506",
          borderRadius: 14,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} width={50} height={43} alt="" />
      </div>
    ),
    size
  );
}
