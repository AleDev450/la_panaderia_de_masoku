import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

export function Logo({
  size = "md",
  withAvatar = false,
  href = "/",
  asImage = false,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  withAvatar?: boolean;
  href?: string;
  /** Usa la placa de madera ilustrada (titulo.png) en vez del texto CSS —
   * pensada para la pantalla de registro/ingreso, donde el logo es
   * protagonista. En el header compacto sigue usándose el texto. */
  asImage?: boolean;
}) {
  const textSize = {
    sm: "text-xl",
    md: "text-2xl sm:text-3xl",
    lg: "text-4xl sm:text-5xl",
    xl: "text-5xl sm:text-6xl",
  }[size];

  const imageWidth = { sm: 140, md: 220, lg: 320, xl: 440 }[size];

  const content = asImage ? (
    <Image
      src="/images/titulo.png"
      alt="LA PANADERÍA DE MASOKU"
      width={imageWidth}
      height={imageWidth}
      priority
      className="h-auto w-full select-none drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)]"
      style={{ width: imageWidth, maxWidth: "100%" }}
    />
  ) : (
    <div className="flex items-center gap-3">
      {withAvatar ? (
        <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-charcoal-light shadow-[0_0_14px_rgba(201,161,59,0.35)]">
          <Image
            src="/images/mascota.png"
            alt=""
            fill
            sizes="40px"
            className="object-cover object-top scale-150"
          />
        </span>
      ) : null}
      <span
        className={clsx(
          "font-fantasy font-bold tracking-[0.06em] text-gold-light text-glow-gold",
          textSize
        )}
      >
        MASOKU
      </span>
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex rounded-md focus-visible:outline-gold-light" aria-label="La Panadería de Masoku — inicio">
      {content}
    </Link>
  );
}
