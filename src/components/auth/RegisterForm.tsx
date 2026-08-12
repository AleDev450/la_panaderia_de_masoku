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
  validatePhone,
} from "@/lib/validation";
import { ArtPanel } from "@/components/auth/ArtPanel";
import { ArtInput } from "@/components/auth/ArtInput";

interface FormErrors {
  fullName?: string;
  phone?: string;
  nickname?: string;
  password?: string;
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
      className="flex w-full flex-col items-center gap-3 lg:gap-2"
    >
      <ArtPanel src="/images/home/registrar.png" alt="" ratio="1136 / 1385">
        <ArtInput
          id="fullName"
          label="Nombre completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          autoComplete="name"
          box={{ top: "31.2%", left: "28.5%", width: "44%", height: "4.2%" }}
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
          box={{ top: "42.2%", left: "28.5%", width: "44%", height: "4.2%" }}
        />
        <ArtInput
          id="nickname"
          label="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          error={errors.nickname}
          autoComplete="nickname"
          box={{ top: "53.1%", left: "28.5%", width: "44%", height: "4.2%" }}
        />
        <ArtInput
          id="password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
          box={{ top: "63.4%", left: "28.5%", width: "44%", height: "4.2%" }}
        />

        <div className="absolute" style={{ top: "69.6%", left: "22%", width: "60%", height: "3.4%" }}>
          <label htmlFor="ageConsent" className="flex h-full cursor-pointer items-start gap-2">
            <input
              id="ageConsent"
              type="checkbox"
              checked={ageConsent}
              onChange={(e) => setAgeConsent(e.target.checked)}
              aria-invalid={Boolean(errors.ageConsent)}
              aria-describedby={errors.ageConsent ? "ageConsent-error" : undefined}
              className="mt-[2%] h-[85%] shrink-0 accent-gold"
              style={{ width: "9%" }}
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
          style={{ top: "75.2%", left: "21%", width: "59%", height: "7.6%" }}
        />

        <button
          type="button"
          onClick={onSwitchToLogin}
          className="absolute rounded outline-none transition focus-visible:ring-2 focus-visible:ring-gold-light"
          style={{ top: "87.5%", left: "30%", width: "40%", height: "4%" }}
        >
          <span className="sr-only">Ingresar</span>
        </button>
      </ArtPanel>
    </form>
  );
}
