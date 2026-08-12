"use client";

import { FormEvent, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { UserServiceError } from "@/services/userService";

/**
 * Puerta de acceso propia para /bakery — a propósito NO reutiliza el
 * look de la pantalla pública (sin fondo de plaza, sin madera/dorado, sin
 * la mascota): un login de staff no debe verse como el login de
 * jugadores, para que quede claro de inmediato que estás en otra parte
 * del sitio. Reutiliza el mismo backend de auth (`login` del
 * SessionContext) porque hoy es un mock local; cuando se conecte
 * Supabase real, solo hay que cambiar lo que hace `login`, no esta UI.
 */
export function BakeryLoginForm() {
  const { login } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (identifier.trim().length < 3 || password.length === 0) {
      setError("Ingresa usuario y contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      await login({ identifier, password });
      // Si no es admin, RequireAdmin se encarga de mostrar el mensaje de
      // acceso restringido en el siguiente render — no hay nada más que
      // hacer aquí.
    } catch (err) {
      setError(err instanceof UserServiceError ? err.message : "No pudimos iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full flex-1 items-center justify-center bg-[#0a0505] px-4">
      <div className="w-full max-w-sm rounded-lg border border-lose/40 bg-[#120707] p-7 shadow-[0_0_40px_rgba(179,56,58,0.15)]">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full border border-lose/50 text-2xl"
          >
            🔒
          </span>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-lose-glow">
            Staff only
          </h1>
          <p className="text-xs text-parchment/40">
            Panel interno — acceso restringido al personal.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div>
            <label htmlFor="bakery-identifier" className="mb-1.5 block text-xs uppercase tracking-wide text-parchment/50">
              Usuario
            </label>
            <input
              id="bakery-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              className="min-h-11 w-full rounded border border-lose/30 bg-black/50 px-3 py-2 font-mono text-sm text-parchment outline-none focus-visible:border-lose-glow"
            />
          </div>
          <div>
            <label htmlFor="bakery-password" className="mb-1.5 block text-xs uppercase tracking-wide text-parchment/50">
              Contraseña
            </label>
            <input
              id="bakery-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="min-h-11 w-full rounded border border-lose/30 bg-black/50 px-3 py-2 font-mono text-sm text-parchment outline-none focus-visible:border-lose-glow"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-lose-glow">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 min-h-11 rounded border border-lose bg-crimson-dark font-mono text-sm font-semibold uppercase tracking-wide text-parchment outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-lose-glow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Verificando…" : "Autenticar"}
          </button>
        </form>
      </div>
    </main>
  );
}
