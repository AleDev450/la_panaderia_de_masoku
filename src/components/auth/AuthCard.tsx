import { Logo } from "@/components/brand/Logo";

/**
 * Card de los formularios de acceso.
 *
 * Reemplaza al antiguo `ArtPanel`, que pintaba un PNG con el marco y el
 * título dibujados y colocaba los campos ENCIMA en posición absoluta
 * (`top: 25%`, `left: 14%`…). Eso ataba el formulario a las proporciones
 * exactas de una imagen: cambiar el arte descolocaba los inputs, y con
 * textos largos o zoom del navegador el contenido se salía del marco.
 *
 * Acá el título es texto, el marco es CSS y los campos van en flujo
 * normal. La lógica de los formularios no cambió.
 */
export function AuthCard({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-stone w-full max-w-md rounded-2xl p-6 sm:p-7">
      <div className="flex flex-col items-center text-center">
        <Logo size="sm" soloIso />
        <h2 className="mt-3 font-display text-xl font-extrabold tracking-wide text-parchment uppercase">
          {titulo}
        </h2>
        <span
          aria-hidden
          className="mt-2 h-0.5 w-10 rounded-full bg-gold shadow-[0_0_10px_rgba(245,197,24,0.7)]"
        />
        {descripcion ? (
          <p className="mt-3 text-xs leading-relaxed text-parchment/50">{descripcion}</p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </div>
  );
}
