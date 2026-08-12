"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { UserServiceError } from "@/services/userService";
import {
  validateAgeConsent,
  validateFullName,
  validateNickname,
  validatePassword,
  validatePasswordConfirmation,
  validatePhone,
} from "@/lib/validation";
import { ArtPanel } from "@/components/auth/ArtPanel";
import { ArtInput } from "@/components/auth/ArtInput";

interface FormErrors {
  fullName?: string;
  phone?: string;
  nickname?: string;
  password?: string;
  confirmPassword?: string;
  ageConsent?: string;
}

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const router = useRouter();
  const { register } = useSession();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ageConsent, setAgeConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {
      fullName: validateFullName(fullName) ?? undefined,
      phone: validatePhone(phone) ?? undefined,
      nickname: validateNickname(nickname) ?? undefined,
      password: validatePassword(password) ?? undefined,
      confirmPassword:
        validatePasswordConfirmation(password, confirmPassword) ?? undefined,
      ageConsent: validateAgeConsent(ageConsent) ?? undefined,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      await register({ fullName, phone, nickname, password });
      showToast({
        variant: "success",
        title: "Cuenta creada",
        description: `Bienvenido, ${nickname}. Tu saldo de demostración es S/250.`,
      });
      router.push("/partidas");
    } catch (err) {
      const message =
        err instanceof UserServiceError ? err.message : "No pudimos crear tu cuenta.";
      showToast({ variant: "warning", title: "No se pudo crear la cuenta", description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Crear cuenta"
      className="flex w-full flex-col items-center gap-2 lg:gap-1.5"
    >
      <ArtPanel src="/images/crear-cuenta.png" alt="" ratio="979 / 1606">
        <ArtInput
          id="fullName"
          label="Nombre completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          autoComplete="name"
          box={{ top: "21.5%", left: "15.3%", width: "69.6%", height: "5.4%" }}
        />
        <ArtInput
          id="phone"
          label="Teléfono (+51)"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
          error={errors.phone}
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="987654321"
          box={{ top: "32.7%", left: "27.7%", width: "57.2%", height: "5.4%" }}
        />
        <ArtInput
          id="nickname"
          label="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          error={errors.nickname}
          autoComplete="nickname"
          box={{ top: "43.8%", left: "15.3%", width: "69.6%", height: "5.3%" }}
        />
        <ArtInput
          id="password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
          box={{ top: "54.9%", left: "15.3%", width: "69.6%", height: "5.4%" }}
        />
        <ArtInput
          id="confirmPassword"
          label="Confirmar contraseña"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
          box={{ top: "66.0%", left: "15.3%", width: "69.6%", height: "5.3%" }}
        />

        <div className="absolute" style={{ top: "73.6%", left: "15.2%", width: "70%", height: "3%" }}>
          <label htmlFor="ageConsent" className="flex h-full cursor-pointer items-start gap-2">
            <input
              id="ageConsent"
              type="checkbox"
              checked={ageConsent}
              onChange={(e) => setAgeConsent(e.target.checked)}
              aria-invalid={Boolean(errors.ageConsent)}
              aria-describedby={errors.ageConsent ? "ageConsent-error" : undefined}
              className="mt-[2%] h-[85%] shrink-0 accent-gold"
              style={{ width: "4.5%" }}
            />
            <span className="sr-only">
              Confirmo que soy mayor de 18 años y acepto las reglas de juego responsable.
            </span>
          </label>
          {errors.ageConsent ? (
            <p
              id="ageConsent-error"
              role="alert"
              className="absolute left-0 top-full z-10 mt-0.5 rounded bg-obsidian/90 px-1.5 py-0.5 text-[clamp(0.6rem,1.3vw,0.75rem)] leading-tight text-lose-glow"
            >
              {errors.ageConsent}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-label={submitting ? "Creando cuenta…" : "Crear cuenta"}
          className="absolute rounded-[6px] outline-none transition focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          style={{ top: "81.3%", left: "15.2%", width: "69.6%", height: "6.8%" }}
        />
      </ArtPanel>

      <button
        type="button"
        onClick={onSwitchToLogin}
        className="rounded font-fantasy text-sm text-parchment/70 outline-none transition hover:text-gold-light focus-visible:ring-2 focus-visible:ring-gold-light lg:text-xs"
      >
        ¿Ya tienes cuenta? <span className="text-gold-light">Iniciar sesión</span>
      </button>
    </form>
  );
}
