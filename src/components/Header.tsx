"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useSession } from "@/context/SessionContext";
import { LevelBadge } from "@/components/LevelBadge";
import { getLevelForPoints } from "@/data/levels";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/partidas", label: "Partidas" },
  { href: "/mis-apuestas", label: "Mis apuestas" },
  { href: "/historial", label: "Historial" },
  { href: "/ranking", label: "Ranking" },
  { href: "/recargar", label: "Recargar saldo" },
  { href: "/como-jugar", label: "Cómo jugar" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const links = isAdmin ? [...NAV_LINKS, { href: "/bakery", label: "Bakery" }] : NAV_LINKS;
  const nivel = getLevelForPoints(user.puntos);

  function handleLogout() {
    logout();
    router.push("/");
  }

  return (
    <header className="panel-stone sticky top-0 z-40 border-x-0 border-t-0 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        {/* Identidad del panadero: su insignia de rango como avatar, su
            nickname donde antes iba la marca, y sus puntos al costado.
            Todo el bloque es el acceso a /perfil. */}
        <Link
          href="/perfil"
          aria-label={`Mi perfil — ${nivel.nombre}, ${user.puntos} puntos`}
          className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-1 transition hover:bg-gold/10 focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-charcoal-light shadow-[0_0_14px_rgba(201,161,59,0.35)]">
            <Image
              src={`/images/levels/nivel-${nivel.id}.png`}
              alt=""
              aria-hidden
              width={40}
              height={40}
              className="h-full w-full select-none object-contain p-0.5"
            />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-fantasy text-lg font-bold tracking-[0.04em] text-gold-light text-glow-gold">
              {user.nickname}
            </span>
            <span className="truncate text-[11px] text-parchment/50">
              {nivel.nombre} · {user.puntos} pts
            </span>
          </span>
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-1 lg:flex"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={clsx(
                "min-h-11 whitespace-nowrap rounded-md px-3 py-2 font-fantasy text-sm font-semibold tracking-wide uppercase transition",
                pathname === link.href
                  ? "text-gold-light"
                  : "text-parchment/60 hover:text-parchment"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <div className="rounded-md border border-gold-dark px-3 py-1.5 text-right">
            <p className="text-xs text-parchment/50">Saldo</p>
            <p className="font-fantasy text-sm font-bold text-gold-light">
              S/{user.balance}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-11 rounded-md border border-gold-dark px-3 py-2 text-xs font-semibold uppercase tracking-wide text-parchment/70 transition hover:border-lose hover:text-lose-glow"
          >
            Cerrar sesión
          </button>
        </div>

        <button
          type="button"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gold-dark lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label="Abrir menú"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden className="text-gold-light">
            {menuOpen ? "✕" : "☰"}
          </span>
        </button>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Navegación principal"
          className="mt-3 flex flex-col gap-1 border-t border-gold-dark/50 pt-3 lg:hidden"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname === link.href ? "page" : undefined}
              className={clsx(
                "min-h-11 rounded-md px-3 py-2.5 font-fantasy text-sm font-semibold tracking-wide uppercase",
                pathname === link.href ? "text-gold-light" : "text-parchment/70"
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/perfil"
            onClick={() => setMenuOpen(false)}
            className="mt-2 flex items-center justify-between rounded-md border border-gold-dark px-3 py-2"
          >
            <span className="text-sm font-semibold text-parchment">{user.nickname}</span>
            <span className="font-fantasy text-sm font-bold text-gold-light">
              S/{user.balance}
            </span>
          </Link>
          <div className="mt-1">
            <LevelBadge puntos={user.puntos} size="sm" />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 min-h-11 rounded-md border border-gold-dark px-3 py-2.5 text-left text-sm font-semibold uppercase tracking-wide text-parchment/70"
          >
            Cerrar sesión
          </button>
        </nav>
      ) : null}
    </header>
  );
}
