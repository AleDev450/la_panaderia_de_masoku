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
      <ArtPanel src="/images/home/iniciar-sesion.png" alt="" ratio="1132 / 1389">
        <ArtInput
          id="login-identifier"
          label="Teléfono o nickname"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          box={{ top: "36.1%", left: "28%", width: "44%", height: "4.8%" }}
        />
        <ArtInput
          id="login-password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          box={{ top: "52.4%", left: "28%", width: "44%", height: "5.4%" }}
        />

        {error ? (
          <p
            role="alert"
            className="absolute z-10 flex items-center justify-center rounded bg-[#231709] px-2 text-center text-[clamp(0.6rem,1.5vw,0.8rem)] leading-tight text-lose-glow"
            style={{ top: "58.5%", left: "18%", width: "64%", height: "4.4%" }}
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          aria-label={submitting ? "Ingresando…" : "Ingresar"}
          className="absolute rounded-[6px] outline-none transition focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          style={{ top: "65%", left: "21%", width: "58%", height: "10.5%" }}
        />

        <button
          type="button"
          onClick={onSwitchToRegister}
          className="absolute rounded outline-none transition focus-visible:ring-2 focus-visible:ring-gold-light"
          style={{ top: "82.3%", left: "30%", width: "40%", height: "4%" }}
        >
          <span className="sr-only">¿No tienes cuenta? Crear cuenta</span>
        </button>
      </ArtPanel>
    </form>
  );
}
