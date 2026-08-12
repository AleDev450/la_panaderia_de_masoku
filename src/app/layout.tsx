import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/context/SessionContext";
import { ToastProvider } from "@/context/ToastContext";
import { RecargasProvider } from "@/context/RecargasContext";
import { MusicToggle } from "@/components/MusicToggle";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LA PANADERÍA DE MASOKU — Apuestas 1 contra 1",
  description:
    "LA PANADERÍA DE MASOKU: apuestas 1 contra 1 entre jugadores. Elige tu lado, encuentra tu rival. Solo demostración, 18+, juego responsable.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${cinzel.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-obsidian text-parchment">
        <ToastProvider>
          <SessionProvider>
            <RecargasProvider>{children}</RecargasProvider>
          </SessionProvider>
        </ToastProvider>
        <MusicToggle />
      </body>
    </html>
  );
}
