"use client";

import { useState } from "react";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { LoginForm } from "@/components/auth/LoginForm";

type Tab = "register" | "login";

/**
 * Sin pestañas propias: crear-cuenta.png / ingresar-cuenta.png ya traen
 * su propio link para cambiar de formulario ("¿No tienes cuenta?" /
 * "¿Ya tienes cuenta?"), así que ese es el único control de cambio.
 */
export function AuthPanel() {
  const [tab, setTab] = useState<Tab>("register");

  return (
    <div className="flex w-full max-w-md flex-col items-center xl:max-w-lg">
      <div id="panel-register" hidden={tab !== "register"} className="w-full">
        {tab === "register" ? (
          <RegisterForm onSwitchToLogin={() => setTab("login")} />
        ) : null}
      </div>
      <div id="panel-login" hidden={tab !== "login"} className="w-full">
        {tab === "login" ? <LoginForm onSwitchToRegister={() => setTab("register")} /> : null}
      </div>
    </div>
  );
}
