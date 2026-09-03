import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/context/SessionContext";
import { ToastProvider } from "@/context/ToastContext";
import { MusicToggle } from "@/components/MusicToggle";

/** Display de marca: pesado y con itálica real, para el titular del hero.
 * Reemplaza a Cinzel, que era una serif de fantasía. */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CACHUDOBET — La apuesta del cachudo",
  description:
    "CACHUDOBET: apuesta 1 contra 1 contra otros jugadores. Elige tu lado, encuentra tu rival y saca provecho. 18+, juego responsable.",
  // El favicon lo genera src/app/icon.tsx desde el isotipo real; no se
  // declara acá para no competir con la convención de archivo de Next.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-obsidian text-parchment">
        <ToastProvider>
          <SessionProvider>{children}</SessionProvider>
        </ToastProvider>
        <MusicToggle />
      </body>
    </html>
  );
}
