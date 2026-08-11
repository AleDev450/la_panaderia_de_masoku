"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { UserServiceError } from "@/services/userService";
import { ArtPanel } from "@/components/auth/ArtPanel";
import { ArtInput } from "@/components/auth/ArtInput";

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const router = useRouter();
  const { login } = useSession();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (identifier.trim().length < 3) {
      setError("Ingresa tu teléfono o nickname registrado.");
      return;
    }
    if (password.length === 0) {
      setError("Ingresa tu contraseña.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await login({ identifier, password });
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
      <ArtPanel src="/images/ingresar-cuenta.png" alt="" ratio="1060 / 1484">
        <ArtInput
          id="login-identifier"
          label="Teléfono o nickname"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          box={{ top: "33.2%", left: "20.0%", width: "58.3%", height: "8.2%" }}
        />
        <ArtInput
          id="login-password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          box={{ top: "49.9%", left: "20.0%", width: "58.3%", height: "8.3%" }}
        />

        {error ? (
          <p
            role="alert"
            className="absolute z-10 flex items-center justify-center rounded bg-[#231709] px-2 text-center text-[clamp(0.6rem,1.5vw,0.8rem)] leading-tight text-lose-glow"
            style={{ top: "59.3%", left: "18%", width: "64%", height: "4.4%" }}
          >
            {error}
          </p>
        ) : (
          <button
            type="button"
            onClick={() =>
              showToast({
                variant: "info",
                title: "Recuperación no disponible",
                description: "Esta es una demo — no hay envío real de correos.",
              })
            }
            className="absolute whitespace-nowrap rounded bg-[#231709] font-fantasy text-[clamp(0.55rem,1.4vw,0.75rem)] text-gold/90 outline-none transition hover:text-gold-light focus-visible:ring-2 focus-visible:ring-gold-light"
            style={{ top: "59.3%", left: "10%", width: "80%", height: "4.4%" }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        <button
          type="submit"
          disabled={submitting}
          aria-label={submitting ? "Ingresando…" : "Ingresar"}
          className="absolute rounded-[6px] outline-none transition focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          style={{ top: "68.5%", left: "20%", width: "58.3%", height: "6.5%" }}
        />

        <button
          type="button"
          onClick={onSwitchToRegister}
          className="absolute whitespace-nowrap rounded bg-[#231709] font-sans text-[clamp(0.5rem,1.25vw,0.7rem)] text-parchment/85 outline-none transition hover:text-gold-light focus-visible:ring-2 focus-visible:ring-gold-light"
          style={{ top: "79.9%", left: "6%", width: "88%", height: "4.6%" }}
        >
          ¿No tienes cuenta? <span className="text-gold-light">Crear cuenta</span>
        </button>
      </ArtPanel>
    </form>
  );
}
