"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { UserServiceError } from "@/services/userService";
import { ArtPanel } from "@/components/auth/ArtPanel";
import { PanelField } from "@/components/auth/PanelField";

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const router = useRouter();
  const { login } = useSession();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (email.trim().length < 3) {
      setError("Ingresa tu correo registrado.");
      return;
    }
    if (password.length === 0) {
      setError("Ingresa tu contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await login({ email, password });
      showToast({
        variant: "success",
        title: `Bienvenido de vuelta, ${user.nickname}`,
      });
      router.push("/partidas");
    } catch (err) {
      setError(err instanceof UserServiceError ? err.message : "No pudimos iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Ingresar" className="flex w-full justify-center">
      {/* iniciar-sesion.png (ingresar_account.png) es un panel de arte en
          blanco — solo trae el marco y el título "INICIAR SESIÓN"
          dibujados. Mismo enfoque que RegisterForm: campos en flujo normal
          dentro de un recuadro absoluto sobre el área de madera vacía. */}
      <ArtPanel src="/images/home/iniciar-sesion.png" alt="" ratio="962 / 1634">
        <div
          className="absolute overflow-y-auto"
          style={{ top: "calc(25% + 5px)", bottom: "12%", left: "14%", right: "14%" }}
        >
          <div className="flex flex-col gap-4">
            <PanelField
              id="login-email"
              label="Correo"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="tu@correo.com"
            />
            <PanelField
              id="login-password"
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            {error ? (
              <p role="alert" className="text-[clamp(0.65rem,1.4vw,0.8rem)] leading-tight text-lose-glow">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 min-h-11 rounded-md border border-gold bg-gradient-to-b from-[#8a5a1f] to-[#5c3a13] font-fantasy text-sm font-bold uppercase tracking-wide text-parchment shadow-[0_2px_10px_rgba(0,0,0,0.4)] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Ingresando…" : "Ingresar"}
            </button>

            <button
              type="button"
              onClick={onSwitchToRegister}
              className="min-h-8 text-center text-[clamp(0.7rem,1.5vw,0.85rem)] font-semibold text-gold-light underline outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              ¿No tienes cuenta? Crear cuenta
            </button>
          </div>
        </div>
      </ArtPanel>
    </form>
  );
}
