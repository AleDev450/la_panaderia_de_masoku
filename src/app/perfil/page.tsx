"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";

/**
 * Lo que se bajó de la cabecera (ver `Header.tsx`). Estaban compitiendo con
 * los juegos en una fila que ya no daba más, y son cosas que uno busca
 * cuando entra a lo suyo, no cuando entra a jugar.
 */
const ACCESOS = [
  {
    href: "/mis-apuestas",
    icono: "🎯",
    titulo: "Mis apuestas",
    detalle: "Lo que tienes en juego ahora, y cancelar lo que nadie cubrió.",
  },
  {
    href: "/historial",
    icono: "📜",
    titulo: "Historial",
    detalle: "Apuestas ya resueltas: lo que cobraste y lo que se te devolvió.",
  },
  {
    href: "/retirar",
    icono: "💸",
    titulo: "Retirar",
    detalle: "Pide tu saldo disponible y el staff te lo yapea.",
  },
  {
    href: "/como-jugar",
    icono: "❓",
    titulo: "Ayuda",
    detalle: "Cómo funcionan las apuestas, los juegos y los pagos.",
  },
];
import { Button } from "@/components/ui/Button";
import { LevelBadge } from "@/components/LevelBadge";
import { LevelProgress } from "@/components/LevelProgress";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import {
  actualizarEmail,
  actualizarNickname,
  cambiarPassword,
  getMisSolicitudesTelefono,
  solicitarCambioTelefono,
} from "@/actions/perfil";
import { SolicitudTelefono } from "@/lib/supabase/types";
import { saldoVisible } from "@/lib/saldo";

const ESTADO_SOLICITUD_LABEL: Record<SolicitudTelefono["estado"], string> = {
  pendiente: "Pendiente de revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

const ESTADO_SOLICITUD_COLOR: Record<SolicitudTelefono["estado"], string> = {
  pendiente: "text-gold-light",
  aprobada: "text-win-glow",
  rechazada: "text-lose-glow",
};

function PerfilContent() {
  const { user, refreshUser, isAdmin } = useSession();
  const { showToast } = useToast();

  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmacion, setPasswordConfirmacion] = useState("");
  const [solicitudes, setSolicitudes] = useState<SolicitudTelefono[] | null>(null);
  const [guardando, setGuardando] = useState<
    "nickname" | "email" | "telefono" | "password" | null
  >(null);

  const refreshSolicitudes = useCallback(async () => {
    const result = await getMisSolicitudesTelefono();
    if (result.ok) setSolicitudes(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refreshSolicitudes();
  }, [refreshSolicitudes]);

  if (!user) return null;

  const tienePendiente = (solicitudes ?? []).some((s) => s.estado === "pendiente");

  async function handleNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuardando("nickname");
    try {
      const result = await actualizarNickname({ nickname });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cambiar", description: result.error });
        return;
      }
      showToast({ variant: "success", title: "Nickname actualizado" });
      await refreshUser();
    } finally {
      setGuardando(null);
    }
  }

  async function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuardando("email");
    try {
      const result = await actualizarEmail({ email });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cambiar", description: result.error });
        return;
      }
      showToast({
        variant: "success",
        title: "Correo actualizado",
        description: "Con este correo inicias sesión a partir de ahora.",
      });
      await refreshUser();
    } finally {
      setGuardando(null);
    }
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordNueva !== passwordConfirmacion) {
      showToast({
        variant: "warning",
        title: "No coinciden",
        description: "La confirmación no es igual a la contraseña nueva.",
      });
      return;
    }
    setGuardando("password");
    try {
      const result = await cambiarPassword({ password: passwordNueva });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cambiar", description: result.error });
        return;
      }
      showToast({ variant: "success", title: "Contraseña actualizada" });
      setPasswordNueva("");
      setPasswordConfirmacion("");
    } finally {
      setGuardando(null);
    }
  }

  async function handleTelefono(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuardando("telefono");
    try {
      const result = await solicitarCambioTelefono({
        telefonoNuevo,
        motivo: motivo || undefined,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo enviar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Solicitud enviada",
        description: "Un administrador la revisará.",
      });
      setTelefonoNuevo("");
      setMotivo("");
      await refreshSolicitudes();
    } finally {
      setGuardando(null);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold text-parchment">Mi perfil</h1>

        <Panel className="mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-bold text-gold-light">{user.nickname}</p>
              {/* El admin no juega: sin saldo ni rango que mostrar. */}
              <p className="text-xs text-parchment/50">
                {isAdmin ? "Cuenta de administrador" : `Saldo disponible S/${saldoVisible(user)}`}
              </p>
            </div>
            {!isAdmin ? <LevelBadge puntos={user.puntos} /> : null}
          </div>
          {!isAdmin ? (
            <div className="mt-4">
              <LevelProgress puntos={user.puntos} />
            </div>
          ) : null}
        </Panel>

        {/* Lo de la cuenta vive acá y ya no en la cabecera: el menú de arriba
            quedó para los juegos, y esto es lo que uno viene a buscar a su
            perfil. El admin no juega, así que no le aparece nada de esto. */}
        {!isAdmin ? (
          <section className="mt-6">
            <h2 className="mb-3 font-display text-lg font-semibold text-gold-light">
              Mi cuenta
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {ACCESOS.map((acceso) => (
                <Link key={acceso.href} href={acceso.href} className="block">
                  <Panel glow className="flex h-full items-start gap-3 p-4">
                    <span aria-hidden className="text-xl leading-none">
                      {acceso.icono}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-sm font-bold text-parchment">
                        {acceso.titulo}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-parchment/50">
                        {acceso.detalle}
                      </span>
                    </span>
                  </Panel>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <Panel className="mt-6 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-gold-light">Nickname</h2>
          <p className="mb-3 text-xs text-parchment/50">
            Es único: si otro jugador ya lo tiene, tendrás que elegir otro.
          </p>
          <form onSubmit={handleNickname} className="flex flex-wrap gap-2">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              aria-label="Nickname"
              className="min-h-11 w-0 flex-1 rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
            <Button
              type="submit"
              disabled={guardando === "nickname" || nickname === user.nickname}
            >
              {guardando === "nickname" ? "Guardando…" : "Guardar"}
            </Button>
          </form>
        </Panel>

        <Panel className="mt-4 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-gold-light">Correo</h2>
          <p className="mb-3 text-xs text-parchment/50">
            Con este correo inicias sesión.
          </p>
          <form onSubmit={handleEmail} className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Correo"
              className="min-h-11 w-0 flex-1 rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
            <Button type="submit" disabled={guardando === "email" || email === user.email}>
              {guardando === "email" ? "Guardando…" : "Guardar"}
            </Button>
          </form>
        </Panel>

        <Panel className="mt-4 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-gold-light">Contraseña</h2>
          <p className="mb-3 text-xs text-parchment/50">
            Mínimo 8 caracteres, combinando letras y números.
          </p>
          <form onSubmit={handlePassword} className="flex flex-col gap-2">
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Contraseña nueva"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              aria-label="Contraseña nueva"
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirma la contraseña nueva"
              value={passwordConfirmacion}
              onChange={(e) => setPasswordConfirmacion(e.target.value)}
              aria-label="Confirmar contraseña nueva"
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />
            <Button
              type="submit"
              disabled={guardando === "password" || !passwordNueva || !passwordConfirmacion}
            >
              {guardando === "password" ? "Guardando…" : "Cambiar contraseña"}
            </Button>
          </form>
        </Panel>

        {/* La cola de cambio de teléfono es para jugadores: el número
            identifica sus depósitos. Un admin no recarga saldo. */}
        {isAdmin ? null : (
        <Panel className="mt-4 p-5">
          <h2 className="mb-1 font-display text-lg font-semibold text-gold-light">Teléfono</h2>
          <p className="mb-3 text-xs text-parchment/50">
            Tu número actual es{" "}
            <span className="font-semibold text-parchment/80">{user.phone || "—"}</span>. No se
            puede cambiar directamente: con él se verifican tus depósitos, así
            que el cambio lo aprueba un administrador.
          </p>

          {tienePendiente ? (
            <p className="rounded-md border border-gold-dark/60 bg-obsidian/40 px-3 py-2.5 text-sm text-gold-light">
              Ya tienes una solicitud pendiente de revisión.
            </p>
          ) : (
            <form onSubmit={handleTelefono} className="flex flex-col gap-2">
              <input
                inputMode="numeric"
                placeholder="Nuevo número (9 dígitos)"
                value={telefonoNuevo}
                onChange={(e) => setTelefonoNuevo(e.target.value.replace(/\D/g, "").slice(0, 9))}
                aria-label="Nuevo teléfono"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
              <textarea
                placeholder="Motivo (opcional)"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                aria-label="Motivo del cambio"
                className="w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />
              <Button type="submit" disabled={guardando === "telefono"}>
                {guardando === "telefono" ? "Enviando…" : "Solicitar cambio"}
              </Button>
            </form>
          )}

          {solicitudes && solicitudes.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {solicitudes.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-gold-dark/40 px-3 py-2 text-xs"
                >
                  <span className="text-parchment/70">
                    {s.telefono_actual || "—"} → {s.telefono_nuevo}
                  </span>
                  <span className={clsx("font-semibold", ESTADO_SOLICITUD_COLOR[s.estado])}>
                    {ESTADO_SOLICITUD_LABEL[s.estado]}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
        )}
      </main>
    </>
  );
}

export default function PerfilPage() {
  return (
    <RequireAuth>
      <PerfilContent />
    </RequireAuth>
  );
}
