"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useSession } from "@/context/SessionContext";
import { Isotipo, Logo } from "@/components/brand/Logo";
import { LevelBadge } from "@/components/LevelBadge";
import { getLevelForPoints } from "@/data/levels";
import { saldoEnJuego, saldoVisible } from "@/lib/saldo";
import { useEffect, useRef, useState } from "react";

/**
 * Las etiquetas son de apuestas; las rutas son las que ya existen. NO se
 * agregan entradas para DEPORTES / SLOTS / CASINO / VIP: esas páginas no
 * existen en la app y un link a una ruta inexistente es un 404 con cara de
 * funcionalidad.
 */
/**
 * LO QUE SE JUEGA VA PRIMERO Y SIEMPRE VISIBLE. Antes eran once entradas en
 * una sola fila: a 1280px no entraban, y la ruleta, cara o sello y el stream
 * quedaban apretados contra el saldo o directamente fuera de la pantalla —
 * estaban en el menú pero no se veían, que para el caso es lo mismo que no
 * estar.
 *
 * Estas cinco entran cómodas desde el breakpoint `lg` (1024px); el resto vive
 * en "Más". En móvil no hay recorte: el menú hamburguesa las muestra todas.
 */
const NAV_JUGADOR = [
  { href: "/partidas", label: "Partidas de hoy" },
  { href: "/ruleta", label: "Ruleta" },
  { href: "/cara-o-sello", label: "Cara o sello" },
  { href: "/en-vivo", label: "En vivo" },
  { href: "/recargar", label: "Depositar" },
];

/** Lo de la cuenta y las pantallas de consulta: importan, pero no son a lo
 * que uno entra a jugar. Van agrupadas para no competir con los juegos. */
const NAV_JUGADOR_MAS = [
  { href: "/mis-apuestas", label: "Mis apuestas" },
  { href: "/historial", label: "Historial" },
  { href: "/ranking", label: "Ranking" },
  { href: "/retirar", label: "Retirar" },
  { href: "/sorteos", label: "Promociones" },
  { href: "/como-jugar", label: "Ayuda" },
];

/** El admin no juega: nada de apuestas, ranking, depositar ni historial —
 * solo lo que administra (ver RequirePlayer). */
const NAV_ADMIN = [
  { href: "/bakery", label: "Panel" },
  { href: "/bakery/titulos", label: "Eventos" },
  { href: "/bakery/ruleta", label: "Ruleta" },
  { href: "/bakery/cara-o-sello", label: "Cara o sello" },
  { href: "/bakery/recargas", label: "Depósitos" },
  { href: "/bakery/retiros", label: "Retiros" },
  { href: "/bakery/usuarios", label: "Usuarios" },
  { href: "/bakery/telefonos", label: "Teléfonos" },
  { href: "/bakery/sorteos", label: "Sorteos" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [masOpen, setMasOpen] = useState(false);
  const masRef = useRef<HTMLDivElement>(null);

  // Cerrar "Más" con Escape o tocando fuera. Van juntos porque son la misma
  // intención —"ya no quiero esto abierto"— y separarlos deja el menú pegado
  // en uno de los dos caminos.
  useEffect(() => {
    if (!masOpen) return;

    const alTocarFuera = (e: MouseEvent) => {
      if (masRef.current && !masRef.current.contains(e.target as Node)) setMasOpen(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMasOpen(false);
    };

    document.addEventListener("mousedown", alTocarFuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alTocarFuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [masOpen]);

  // Al cambiar de página los menús se cierran solos: dejarlos abiertos sobre
  // la pantalla nueva se ve como un menú trabado. Los links ya se cierran al
  // hacer clic, pero esto cubre lo que no pasa por ahí — el botón "atrás" del
  // navegador, sobre todo.
  //
  // Se ajusta DURANTE EL RENDER y no en un efecto: es el patrón que React
  // recomienda para reaccionar a un cambio de prop, y evita el repintado de
  // más que provoca hacerlo después de pintar.
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (rutaPrevia !== pathname) {
    setRutaPrevia(pathname);
    setMasOpen(false);
    setMenuOpen(false);
  }

  if (!user) return null;

  const links = isAdmin ? NAV_ADMIN : NAV_JUGADOR;
  // El panel del staff no se agrupa: sus nueve entradas son todas trabajo.
  const secundarios = isAdmin ? [] : NAV_JUGADOR_MAS;
  const nivel = getLevelForPoints(user.puntos);
  const inicio = isAdmin ? "/bakery" : "/partidas";
  const enSecundario = secundarios.some((l) => l.href === pathname);

  function handleLogout() {
    logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gold-dark bg-obsidian/85 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        {/* Marca a la izquierda, como en cualquier plataforma de apuestas.
            El acceso al perfil se movió a la derecha, junto al saldo. */}
        <Link
          href={inicio}
          aria-label="CACHUDOBET — inicio"
          className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          <Logo size="sm" className="hidden sm:inline-flex" priority />
          <Logo size="sm" soloIso className="sm:hidden" priority />
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-0.5 lg:flex"
        >
          {links.map((link) => {
            const activo = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={activo ? "page" : undefined}
                className={clsx(
                  "relative min-h-11 whitespace-nowrap rounded-md px-3 py-2 font-display text-[13px] font-bold tracking-wide uppercase transition",
                  activo
                    ? "text-gold"
                    : "text-parchment/55 hover:bg-white/5 hover:text-parchment"
                )}
              >
                {link.label}
                {activo ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gold shadow-[0_0_10px_rgba(245,197,24,0.8)]"
                  />
                ) : null}
              </Link>
            );
          })}

          {secundarios.length > 0 ? (
            <div className="relative" ref={masRef}>
              <button
                type="button"
                aria-expanded={masOpen}
                aria-haspopup="true"
                onClick={() => setMasOpen((v) => !v)}
                className={clsx(
                  "relative flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-3 py-2 font-display text-[13px] font-bold uppercase tracking-wide transition",
                  masOpen || enSecundario
                    ? "text-gold"
                    : "text-parchment/55 hover:bg-white/5 hover:text-parchment"
                )}
              >
                Más
                <span aria-hidden className="text-[10px]">
                  {masOpen ? "▲" : "▼"}
                </span>
                {enSecundario ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gold shadow-[0_0_10px_rgba(245,197,24,0.8)]"
                  />
                ) : null}
              </button>

              {masOpen ? (
                <div className="absolute right-0 top-full z-50 mt-3 min-w-48 rounded-lg border border-gold-dark bg-charcoal p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)]">
                  {secundarios.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={pathname === link.href ? "page" : undefined}
                      onClick={() => setMasOpen(false)}
                      className={clsx(
                        "block min-h-11 rounded-md px-3 py-2.5 font-display text-[13px] font-bold uppercase tracking-wide transition",
                        pathname === link.href
                          ? "bg-gold/10 text-gold"
                          : "text-parchment/65 hover:bg-white/5 hover:text-parchment"
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {!isAdmin ? (
            <div className="rounded-md border border-gold-dark bg-charcoal px-3 py-1.5 text-right">
              <p className="text-[10px] uppercase tracking-wide text-parchment/40">Saldo</p>
              <p className="font-display text-sm font-extrabold text-gold">
                S/{saldoVisible(user)}
              </p>
              {/* Sin esto el saldo parece evaporarse al apostar: pones 20 de
                  116 y la pantalla dice 96, sin decir dónde están los otros. */}
              {saldoEnJuego(user) > 0 ? (
                <p className="text-[10px] text-parchment/45">
                  +S/{saldoEnJuego(user)} en juego
                </p>
              ) : null}
            </div>
          ) : null}

          <Link
            href="/perfil"
            aria-label={
              isAdmin
                ? "Mi perfil — administrador"
                : `Mi perfil — ${nivel.nombre}, ${user.puntos} puntos`
            }
            className="flex min-w-0 items-center gap-2 rounded-md border border-gold-dark bg-charcoal px-2 py-1.5 transition hover:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold-light"
          >
            <span
              className={clsx(
                "relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-charcoal-light",
                isAdmin
                  ? "border-lose text-sm"
                  : "border-gold/70 shadow-[0_0_12px_rgba(245,197,24,0.3)]"
              )}
            >
              {isAdmin ? (
                <span aria-hidden>🔒</span>
              ) : (
                <Isotipo size={24} />
              )}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="max-w-[9rem] truncate font-display text-sm font-bold text-parchment">
                {user.nickname}
              </span>
              <span className="max-w-[9rem] truncate text-[10px] text-parchment/45">
                {isAdmin ? "Administrador" : `${nivel.nombre} · ${user.puntos} pts`}
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="min-h-11 rounded-md border border-gold-dark px-3 py-2 text-xs font-semibold uppercase tracking-wide text-parchment/60 transition hover:border-lose hover:text-lose-glow"
          >
            Salir
          </button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          {!isAdmin ? (
            <span className="rounded-md border border-gold-dark bg-charcoal px-2.5 py-1.5 font-display text-sm font-extrabold text-gold">
              S/{saldoVisible(user)}
            </span>
          ) : null}
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gold-dark bg-charcoal"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span aria-hidden className="text-gold">
              {menuOpen ? "✕" : "☰"}
            </span>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Navegación principal"
          className="mt-3 flex flex-col gap-1 border-t border-gold-dark pt-3 lg:hidden"
        >
          {/* En móvil no se agrupa nada: el menú es una lista vertical y hay
              sitio de sobra, así que "Más" solo agregaría un toque extra. */}
          {[...links, ...secundarios].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname === link.href ? "page" : undefined}
              className={clsx(
                "min-h-11 rounded-md px-3 py-2.5 font-display text-sm font-bold tracking-wide uppercase transition",
                pathname === link.href
                  ? "bg-gold/10 text-gold"
                  : "text-parchment/70 hover:bg-white/5"
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/perfil"
            onClick={() => setMenuOpen(false)}
            className="mt-2 flex items-center justify-between gap-2 rounded-md border border-gold-dark bg-charcoal px-3 py-2.5"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-parchment">
              {user.nickname}
            </span>
            <span className="shrink-0 font-display text-sm font-extrabold text-gold">
              {isAdmin
                ? "Administrador"
                : saldoEnJuego(user) > 0
                  ? `S/${saldoVisible(user)} · +S/${saldoEnJuego(user)} en juego`
                  : `S/${saldoVisible(user)}`}
            </span>
          </Link>
          {!isAdmin ? (
            <div className="mt-1">
              <LevelBadge puntos={user.puntos} size="sm" />
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 min-h-11 rounded-md border border-gold-dark px-3 py-2.5 text-left text-sm font-semibold uppercase tracking-wide text-parchment/60"
          >
            Cerrar sesión
          </button>
        </nav>
      ) : null}
    </header>
  );
}
