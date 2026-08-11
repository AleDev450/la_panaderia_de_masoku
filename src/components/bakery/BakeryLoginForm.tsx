"use client";

import { FormEvent, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { UserServiceError } from "@/services/userService";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/Logo";

/**
 * Puerta de acceso propia para /bakery, separada de las pestañas de la
 * pantalla principal — para no depender de que el usuario ya haya
 * iniciado sesión ahí. Reutiliza el mismo backend de auth (`login` del
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
    <main className="mx-auto flex min-h-[80vh] w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-4">
      <Logo size="md" href="" />
      <Panel className="w-full p-6">
        <h1 className="mb-1 font-fantasy text-lg font-bold text-gold-light">
          Acceso al panel
        </h1>
        <p className="mb-5 text-sm text-parchment/60">
          Solo personal autorizado de la panadería.
        </p>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div>
            <label htmlFor="bakery-identifier" className="mb-1.5 block text-sm text-parchment/80">
              Usuario
            </label>
            <input
              id="bakery-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:border-gold-light"
            />
          </div>
          <div>
            <label htmlFor="bakery-password" className="mb-1.5 block text-sm text-parchment/80">
              Contraseña
            </label>
            <input
              id="bakery-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:border-gold-light"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-lose-glow">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="mt-1 w-full">
            {submitting ? "Ingresando…" : "Entrar al panel"}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
