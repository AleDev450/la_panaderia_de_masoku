"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { UserServiceError } from "@/services/userService";
import {
  validateAgeConsent,
  validateEmail,
  validateFullName,
  validateNickname,
  validatePassword,
  validatePhone,
} from "@/lib/validation";
import { ArtPanel } from "@/components/auth/ArtPanel";
import { PanelField } from "@/components/auth/PanelField";

interface FormErrors {
  fullName?: string;
  phone?: string;
  nickname?: string;
  email?: string;
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConsent, setAgeConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Una vez que un campo ya mostró error, se revalida en cada tecla para
  // que el mensaje desaparezca (o cambie) apenas la corrección sea
  // válida, en vez de quedarse pegado con el error viejo hasta el
  // próximo submit. Campos sin error todavía no se tocan acá — validar
  // antes de que el usuario termine de escribir sería más molesto que útil.
  function revalidate<K extends keyof FormErrors>(field: K, message: string | null) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: message ?? undefined } : prev));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {
      fullName: validateFullName(fullName) ?? undefined,
      phone: validatePhone(phone) ?? undefined,
      nickname: validateNickname(nickname) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
      ageConsent: validateAgeConsent(ageConsent) ?? undefined,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      await register({ fullName, phone, nickname, email, password });
      showToast({
        variant: "success",
        title: "Cuenta creada",
        description: `Bienvenido, ${nickname}.`,
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
      className="flex w-full justify-center"
    >
      {/* registrar.png (create_account.png) es un panel de arte en blanco —
          solo trae el marco y el título "REGISTRAR" dibujados, sin cajas de
          campo ni botón. Los campos van en flujo normal dentro de un
          recuadro absoluto que cubre el área de madera vacía (ver
          PanelField), en vez de intentar alinearlos a una caja que ya no
          existe en el arte. */}
      <ArtPanel src="/images/home/registrar.png" alt="" ratio="950 / 1750">
        <div
          className="absolute overflow-y-auto"
          style={{ top: "calc(20% + 5px)", bottom: "9%", left: "50%", width: "70%", transform: "translateX(-50%)" }}
        >
          <div className="flex flex-col gap-1">
            <PanelField
              id="fullName"
              label="Nombre completo"
              value={fullName}
              onChange={(e) => {
                const value = e.target.value;
                setFullName(value);
                revalidate("fullName", validateFullName(value));
              }}
              error={errors.fullName}
              autoComplete="name"
            />
            <PanelField
              id="phone"
              label="Teléfono (+51)"
              value={phone}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 9);
                setPhone(value);
                revalidate("phone", validatePhone(value));
              }}
              error={errors.phone}
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="987654321"
            />
            <PanelField
              id="nickname"
              label="Nickname"
              value={nickname}
              onChange={(e) => {
                const value = e.target.value;
                setNickname(value);
                revalidate("nickname", validateNickname(value));
              }}
              error={errors.nickname}
              autoComplete="nickname"
            />
            <PanelField
              id="email"
              label="Correo"
              type="email"
              value={email}
              onChange={(e) => {
                const value = e.target.value;
                setEmail(value);
                revalidate("email", validateEmail(value));
              }}
              error={errors.email}
              // "off" a propósito, no "email": es un registro, no un
              // login — el dropdown de cuentas de Chrome que dispara
              // autoComplete="email" quedaba tan alto que tapaba el botón
              // "Crear cuenta" de abajo y lo dejaba sin poder clickear.
              autoComplete="off"
              placeholder="tu@correo.com"
            />
            <PanelField
              id="password"
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => {
                const value = e.target.value;
                setPassword(value);
                revalidate("password", validatePassword(value));
              }}
              error={errors.password}
              autoComplete="new-password"
            />

            <div>
              <label htmlFor="ageConsent" className="flex cursor-pointer items-start gap-2">
                <input
                  id="ageConsent"
                  type="checkbox"
                  checked={ageConsent}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAgeConsent(checked);
                    revalidate("ageConsent", validateAgeConsent(checked));
                  }}
                  aria-invalid={Boolean(errors.ageConsent)}
                  aria-describedby={errors.ageConsent ? "ageConsent-error" : undefined}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
                />
                <span className="text-[clamp(0.65rem,1.4vw,0.8rem)] text-parchment/80">
                  Confirmo que soy mayor de 18 años y acepto las reglas de juego responsable.
                </span>
              </label>
              {errors.ageConsent ? (
                <p
                  id="ageConsent-error"
                  role="alert"
                  className="mt-1 text-[clamp(0.6rem,1.3vw,0.75rem)] leading-tight text-lose-glow"
                >
                  {errors.ageConsent}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 rounded-md border border-gold bg-gradient-to-b from-[#8a5a1f] to-[#5c3a13] font-fantasy text-sm font-bold uppercase tracking-wide text-parchment shadow-[0_2px_10px_rgba(0,0,0,0.4)] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-gold-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creando cuenta…" : "Crear cuenta"}
            </button>

            <button
              type="button"
              onClick={onSwitchToLogin}
              className="py-0.5 text-center text-[clamp(0.7rem,1.5vw,0.85rem)] font-semibold text-gold-light underline outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            >
              ¿Ya tienes cuenta? Ingresar
            </button>
          </div>
        </div>
      </ArtPanel>
    </form>
  );
}
