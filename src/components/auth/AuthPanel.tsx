"use client";

import { useState } from "react";
import clsx from "clsx";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { LoginForm } from "@/components/auth/LoginForm";

type Tab = "register" | "login";

export function AuthPanel() {
  const [tab, setTab] = useState<Tab>("register");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <div
        role="tablist"
        aria-label="Acceso a tu cuenta"
        className="inline-flex gap-1 rounded-full border border-gold-dark/60 bg-obsidian/70 p-1 backdrop-blur-sm"
      >
        <TabButton active={tab === "register"} onClick={() => setTab("register")} controls="panel-register">
          Crear cuenta
        </TabButton>
        <TabButton active={tab === "login"} onClick={() => setTab("login")} controls="panel-login">
          Ingresar
        </TabButton>
      </div>

      <div id="panel-register" role="tabpanel" aria-labelledby="tab-register" hidden={tab !== "register"} className="w-full">
        {tab === "register" ? <RegisterForm /> : null}
      </div>
      <div id="panel-login" role="tabpanel" aria-labelledby="tab-login" hidden={tab !== "login"} className="w-full">
        {tab === "login" ? <LoginForm onSwitchToRegister={() => setTab("register")} /> : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      id={controls === "panel-register" ? "tab-register" : "tab-login"}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={clsx(
        "min-h-9 rounded-full px-4 font-fantasy text-xs font-semibold tracking-wide uppercase transition",
        active
          ? "bg-crimson text-gold-light"
          : "text-parchment/50 hover:text-parchment/80"
      )}
    >
      {children}
    </button>
  );
}
