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
    <div className="relative w-full max-w-sm" style={{ aspectRatio: ratio }}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 1024px) 24rem, 90vw"
        className="select-none object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        priority
      />
      {children}
    </div>
  );
}
