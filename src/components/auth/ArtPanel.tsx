import Image from "next/image";

export function ArtPanel({
  src,
  alt,
  ratio,
  children,
}: {
  src: string;
  alt: string;
  ratio: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative w-[22rem] max-w-[90vw] sm:w-[26rem] lg:h-[64vh] lg:max-h-[40rem] lg:min-h-[22rem] lg:w-auto lg:max-w-[28vw]"
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1280px) 32rem, 92vw"
        className="select-none object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        priority
      />
      {children}
    </div>
  );
}
