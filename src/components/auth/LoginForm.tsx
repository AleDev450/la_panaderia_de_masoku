"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { UserServiceError } from "@/services/userService";
import { AuthCard } from "@/components/auth/AuthCard";
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
      <AuthCard
        titulo="Iniciar sesión"
        descripcion="Entra con tu correo y vuelve a la mesa."
      >
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
          <p role="alert" className="text-sm leading-tight text-lose-glow">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 min-h-12 rounded-lg bg-gold font-display text-sm font-extrabold uppercase tracking-wide text-obsidian shadow-[0_6px_24px_-8px_rgba(245,197,24,0.8)] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>

        <button
          type="button"
          onClick={onSwitchToRegister}
          className="min-h-8 text-center text-sm font-semibold text-gold underline-offset-4 outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-gold-light"
        >
          ¿No tienes cuenta? Regístrate
        </button>
      </AuthCard>
    </form>
  );
}
