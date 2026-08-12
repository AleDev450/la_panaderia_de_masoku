import Image from "next/image";

export function GameRulesSidebar() {
  return (
    <div className="flex w-full flex-col items-center gap-5 lg:block">
      {/* El cartel "Hoy se hornea" trae el VS de panes dibujado — se
          mantiene decorativo y se duplica como texto accesible. */}
      <div
        className="relative w-[22rem] max-w-[90vw] sm:w-[26rem] lg:h-auto lg:w-full lg:max-w-none"
        style={{ aspectRatio: "1536 / 1024" }}
      >
        <Image
          src="/images/home/hoy-se-hornea.png"
          alt=""
          aria-hidden
          fill
          sizes="(min-width: 1280px) 32vw, 92vw"
          className="select-none object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          draggable={false}
        />
      </div>

      <div className="sr-only">
        <h1>Hoy se hornea</h1>
        <p>Que gane el mejor panadero.</p>
      </div>
    </div>
  );
}
