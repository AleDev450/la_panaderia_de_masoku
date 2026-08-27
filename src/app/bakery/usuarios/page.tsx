"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { LevelBadge } from "@/components/LevelBadge";
import { useToast } from "@/context/ToastContext";
import {
  UsuarioAdmin,
  ajustarSaldo,
  banearUsuario,
  cambiarPasswordUsuario,
  darSaldoFake,
  eliminarUsuario,
  getUsuarios,
  resetearPlataforma,
} from "@/actions/admin";
import { HERRAMIENTAS_PRUEBA } from "@/lib/flags";

function AdminUsuariosContent() {
  const { showToast } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroDeposito, setFiltroDeposito] = useState<"todos" | "con" | "sin">("todos");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<UsuarioAdmin | null>(null);
  const [motivo, setMotivo] = useState("");
  const [eliminando, setEliminando] = useState<UsuarioAdmin | null>(null);
  const [cambiandoPassword, setCambiandoPassword] = useState<UsuarioAdmin | null>(null);
  const [passwordNueva, setPasswordNueva] = useState("");
  const [ajustandoSaldo, setAjustandoSaldo] = useState<UsuarioAdmin | null>(null);
  const [nuevoSaldo, setNuevoSaldo] = useState("");
  const [motivoAjusteSaldo, setMotivoAjusteSaldo] = useState("");
  const [dandoFake, setDandoFake] = useState<UsuarioAdmin | null>(null);
  const [montoFake, setMontoFake] = useState("");
  const [motivoFake, setMotivoFake] = useState("");
  const [reiniciando, setReiniciando] = useState(false);
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);
  const [textoConfirmacion, setTextoConfirmacion] = useState("");

  const refresh = useCallback(async () => {
    const result = await getUsuarios();
    if (result.ok) setUsuarios(result.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (usuarios ?? [])
      .filter(
        (u) =>
          !q ||
          u.nickname.toLowerCase().includes(q) ||
          (u.fullName ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").includes(q)
      )
      .filter((u) => {
        if (filtroDeposito === "con") return u.depositadoTotal > 0;
        if (filtroDeposito === "sin") return u.depositadoTotal === 0;
        return true;
      });
  }, [usuarios, busqueda, filtroDeposito]);

  async function aplicarBaneo(usuario: UsuarioAdmin, banear: boolean, motivoTexto?: string) {
    setProcesando(usuario.id);
    try {
      const result = await banearUsuario({
        usuarioId: usuario.id,
        banear,
        motivo: motivoTexto || undefined,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo aplicar", description: result.error });
        return;
      }
      showToast({
        variant: banear ? "warning" : "success",
        title: banear ? "Cuenta suspendida" : "Suspensión levantada",
        description: `${usuario.nickname} ${banear ? "ya no puede apostar." : "puede volver a apostar."}`,
      });
      setConfirmando(null);
      setMotivo("");
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function aplicarEliminar(usuario: UsuarioAdmin) {
    setProcesando(usuario.id);
    try {
      const result = await eliminarUsuario({ usuarioId: usuario.id });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo eliminar", description: result.error });
        return;
      }
      showToast({
        variant: "success",
        title: "Cuenta eliminada",
        description: `${usuario.nickname} ya no existe.`,
      });
      setEliminando(null);
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function aplicarCambioPassword(usuario: UsuarioAdmin) {
    setProcesando(usuario.id);
    try {
      const result = await cambiarPasswordUsuario({
        usuarioId: usuario.id,
        password: passwordNueva,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo cambiar", description: result.error });
        return;
      }
      showToast({
        variant: "success",
        title: "Contraseña actualizada",
        description: `Nueva contraseña asignada a ${usuario.nickname}.`,
      });
      setCambiandoPassword(null);
      setPasswordNueva("");
    } finally {
      setProcesando(null);
    }
  }

  async function aplicarAjusteSaldo(usuario: UsuarioAdmin) {
    setProcesando(usuario.id);
    try {
      const result = await ajustarSaldo({
        usuarioId: usuario.id,
        nuevoSaldo: Number(nuevoSaldo),
        motivo: motivoAjusteSaldo,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo ajustar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Saldo ajustado",
        description: `${usuario.nickname} ahora tiene S/${result.data.saldo_disponible} disponible.`,
      });
      setAjustandoSaldo(null);
      setNuevoSaldo("");
      setMotivoAjusteSaldo("");
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function aplicarSaldoFake(usuario: UsuarioAdmin) {
    setProcesando(usuario.id);
    try {
      const result = await darSaldoFake({
        usuarioId: usuario.id,
        monto: Number(montoFake),
        motivo: motivoFake,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo dar saldo fake", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: "Saldo fake actualizado",
        description: `${usuario.nickname} tiene S/${result.data.saldo_fake} de saldo fake.`,
      });
      setDandoFake(null);
      setMontoFake("");
      setMotivoFake("");
      await refresh();
    } finally {
      setProcesando(null);
    }
  }

  async function handleReiniciarPlataforma() {
    setReiniciando(true);
    try {
      const result = await resetearPlataforma();
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo reiniciar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: `${result.data} usuario(s) eliminados`,
        description: "Apuestas, recargas, retiros y rankings quedaron en cero.",
      });
      setConfirmarReinicio(false);
      setTextoConfirmacion("");
      await refresh();
    } finally {
      setReiniciando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Usuarios</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Suspender una cuenta no borra nada: el usuario conserva su saldo e
          historial, solo deja de poder apostar.
        </p>

        {HERRAMIENTAS_PRUEBA && (usuarios?.length ?? 0) > 0 ? (
          <Panel className="mt-6 flex flex-wrap items-center justify-between gap-3 border-dashed border-lose/40 p-4">
            <div>
              <p className="font-fantasy text-sm font-bold text-lose-glow">
                Herramienta de pruebas
              </p>
              <p className="mt-0.5 text-xs text-parchment/50">
                Borra los {usuarios?.length} usuarios (cuenta y todo su
                historial), reinicia rankings, recargas y retiros, y borra
                también los títulos/salas creados. Desactívalo con
                NEXT_PUBLIC_HERRAMIENTAS_PRUEBA=false antes de abrir el
                registro al público.
              </p>
            </div>
            <Button
              type="button"
              variant="lose"
              disabled={reiniciando}
              onClick={() => setConfirmarReinicio(true)}
              className="min-h-9 px-3 py-1 text-xs"
            >
              Reiniciar plataforma
            </Button>
          </Panel>
        ) : null}

        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nickname, nombre o teléfono"
          aria-label="Buscar usuario"
          className="mt-6 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { value: "todos" as const, label: "Todos" },
            { value: "con" as const, label: "Depositaron" },
            { value: "sin" as const, label: "Sin depósito real" },
          ].map((opcion) => (
            <button
              key={opcion.value}
              type="button"
              aria-pressed={filtroDeposito === opcion.value}
              onClick={() => setFiltroDeposito(opcion.value)}
              className={clsx(
                "min-h-9 rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-gold-light",
                filtroDeposito === opcion.value
                  ? "border-gold bg-gold-dark/40 text-gold-light"
                  : "border-gold-dark/60 text-parchment/60 hover:border-gold-light"
              )}
            >
              {opcion.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-parchment/40">
          &quot;Sin depósito real&quot; es saldo que nunca vino de una
          recarga aprobada — candidato a ajustar si era de prueba.
        </p>

        <section className="mt-6">
          {usuarios === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : filtrados.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              {busqueda || filtroDeposito !== "todos"
                ? "Ningún usuario coincide con el filtro."
                : "Todavía no hay usuarios registrados."}
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {filtrados.map((u) => {
                const saldoSinDeposito = u.depositadoTotal === 0 && u.saldoDisponible + u.saldoRetenido > 0;
                return (
                <Panel
                  key={u.id}
                  className={clsx("flex flex-col gap-3 p-4", u.baneado && "border-lose/60")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-fantasy text-lg font-bold text-gold-light">
                          {u.nickname}
                        </span>
                        {u.baneado ? (
                          <span className="rounded-md border border-lose px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-lose-glow">
                            Suspendido
                          </span>
                        ) : null}
                        {saldoSinDeposito ? (
                          <span
                            title="Tiene saldo pero nunca aprobaste una recarga suya"
                            className="rounded-md border border-gold-light px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold-light"
                          >
                            Saldo sin depósito
                          </span>
                        ) : null}
                      </p>
                      {u.fullName ? (
                        <p className="text-sm text-parchment/80">{u.fullName}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-parchment/50">
                        Tel. {u.phone || "—"} · desde{" "}
                        {new Date(u.createdAt).toLocaleDateString("es-PE")}
                      </p>
                      {u.ipRegistro ? (
                        <p className="mt-0.5 text-xs text-parchment/40">
                          IP de registro:{" "}
                          <span className="font-mono text-parchment/60">{u.ipRegistro}</span>
                        </p>
                      ) : null}
                      {u.baneado && u.baneadoMotivo ? (
                        <p className="mt-1 text-xs text-lose-glow">Motivo: {u.baneadoMotivo}</p>
                      ) : null}
                    </div>
                    <LevelBadge puntos={u.puntos} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Dato label="Disponible" valor={`S/${u.saldoDisponible}`} />
                    <Dato label="En juego" valor={`S/${u.saldoRetenido}`} />
                    <Dato label="Depositado" valor={`S/${u.depositadoTotal}`} />
                    <Dato
                      label="Fake"
                      valor={`S/${u.saldoFake}${u.saldoFakeRetenido > 0 ? ` (+${u.saldoFakeRetenido} en juego)` : ""}`}
                    />
                    <Dato label="Puntos" valor={String(u.puntos)} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {u.baneado ? (
                      <Button
                        type="button"
                        variant="win"
                        disabled={procesando === u.id}
                        onClick={() => aplicarBaneo(u, false)}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        Levantar suspensión
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="lose"
                        disabled={procesando === u.id}
                        onClick={() => {
                          setConfirmando(u);
                          setMotivo("");
                        }}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        Suspender cuenta
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={procesando === u.id}
                      onClick={() => {
                        setCambiandoPassword(u);
                        setPasswordNueva("");
                      }}
                      className="min-h-9 px-3 py-1 text-xs"
                    >
                      Cambiar contraseña
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={procesando === u.id}
                      onClick={() => {
                        setAjustandoSaldo(u);
                        setNuevoSaldo(String(u.saldoDisponible));
                        setMotivoAjusteSaldo("");
                      }}
                      className="min-h-9 px-3 py-1 text-xs"
                    >
                      Ajustar saldo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={procesando === u.id}
                      onClick={() => {
                        setDandoFake(u);
                        setMontoFake("");
                        setMotivoFake("");
                      }}
                      className="min-h-9 px-3 py-1 text-xs"
                    >
                      Dar saldo fake
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={procesando === u.id}
                      onClick={() => setEliminando(u)}
                      className="min-h-9 border border-lose-glow/40 px-3 py-1 text-xs text-lose-glow"
                    >
                      Eliminar cuenta
                    </Button>
                  </div>
                </Panel>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {confirmando ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Suspender a ${confirmando.nickname}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmando(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-lose-glow">
              Suspender a {confirmando.nickname}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              No podrá crear nuevas apuestas. Conserva su saldo
              (S/{confirmando.saldoDisponible} disponible, S/
              {confirmando.saldoRetenido} en juego) y sus apuestas en curso
              se liquidan normalmente.
            </p>

            <label htmlFor="motivo-baneo" className="mt-4 mb-1.5 block text-sm text-parchment/80">
              Motivo (opcional)
            </label>
            <textarea
              id="motivo-baneo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="lose"
                disabled={procesando === confirmando.id}
                onClick={() => aplicarBaneo(confirmando, true, motivo)}
                className="flex-1"
              >
                {procesando === confirmando.id ? "Suspendiendo…" : "Suspender"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmando(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {eliminando ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Eliminar a ${eliminando.nickname}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEliminando(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-lose-glow">
              Eliminar a {eliminando.nickname}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Esto borra la cuenta para siempre — no es como suspender. Solo
              funciona si el usuario no tiene saldo ni historial de apuestas;
              si lo tiene, usa &quot;Suspender cuenta&quot; en su lugar.
            </p>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="lose"
                disabled={procesando === eliminando.id}
                onClick={() => aplicarEliminar(eliminando)}
                className="flex-1"
              >
                {procesando === eliminando.id ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEliminando(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cambiandoPassword ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Cambiar contraseña de ${cambiandoPassword.nickname}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCambiandoPassword(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-gold-light">
              Cambiar contraseña de {cambiandoPassword.nickname}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Se reemplaza de inmediato. Mínimo 8 caracteres, combinando
              letras y números — comunícasela al usuario por fuera de la app.
            </p>

            <input
              type="text"
              autoComplete="off"
              placeholder="Contraseña nueva"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              aria-label="Contraseña nueva"
              className="mt-4 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                disabled={procesando === cambiandoPassword.id || passwordNueva.length < 8}
                onClick={() => aplicarCambioPassword(cambiandoPassword)}
                className="flex-1"
              >
                {procesando === cambiandoPassword.id ? "Guardando…" : "Cambiar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCambiandoPassword(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {ajustandoSaldo ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Ajustar saldo de ${ajustandoSaldo.nickname}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAjustandoSaldo(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-gold-light">
              Ajustar saldo de {ajustandoSaldo.nickname}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Saldo disponible actual: S/{ajustandoSaldo.saldoDisponible}. No
              toca el saldo en juego (S/{ajustandoSaldo.saldoRetenido}).
            </p>
            <div className="mt-3 rounded-md border border-gold-light/40 bg-gold/5 p-3 text-xs leading-relaxed text-parchment/70">
              La diferencia <strong className="text-parchment/90">cuenta como
              un depósito</strong>: entra en &quot;Depositado hoy&quot;, en el
              Ingreso del día y en &quot;En Yape deberías tener&quot;, igual
              que una recarga aprobada. Si bajas el saldo, resta.
              <br />
              ¿Quieres darle saldo que <strong className="text-parchment/90">no
              sea plata</strong>? Usa &quot;Dar saldo fake&quot;: eso no entra
              en ninguna de esas cuentas.
            </div>

            <label htmlFor="nuevo-saldo" className="mt-4 mb-1.5 block text-sm text-parchment/80">
              Saldo disponible nuevo
            </label>
            <input
              id="nuevo-saldo"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={nuevoSaldo}
              onChange={(e) => setNuevoSaldo(e.target.value)}
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <label
              htmlFor="motivo-ajuste-saldo"
              className="mt-3 mb-1.5 block text-sm text-parchment/80"
            >
              Motivo
            </label>
            <input
              id="motivo-ajuste-saldo"
              value={motivoAjusteSaldo}
              onChange={(e) => setMotivoAjusteSaldo(e.target.value)}
              placeholder="Ej. Saldo de prueba, no es real"
              className="w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                disabled={
                  procesando === ajustandoSaldo.id ||
                  nuevoSaldo === "" ||
                  motivoAjusteSaldo.trim().length < 3
                }
                onClick={() => aplicarAjusteSaldo(ajustandoSaldo)}
                className="flex-1"
              >
                {procesando === ajustandoSaldo.id ? "Guardando…" : "Ajustar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAjustandoSaldo(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {dandoFake ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Dar saldo fake a ${dandoFake.nickname}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDandoFake(null);
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-gold-light">
              Dar saldo fake a {dandoFake.nickname}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Plata de mentira: no cuenta como depósito, no se puede retirar y
              no entra en &quot;En Yape deberías tener&quot;. Tiene ahora S/
              {dandoFake.saldoFake} disponible
              {dandoFake.saldoFakeRetenido > 0
                ? ` y S/${dandoFake.saldoFakeRetenido} en juego`
                : ""}
              . El monto se SUMA — pon negativo para quitarle.
            </p>

            <div className="mt-3 rounded-md border border-lose-glow/40 bg-lose/5 p-3 text-xs leading-relaxed text-parchment/70">
              <p className="font-semibold text-parchment/90">Lo que te cuesta:</p>
              <p className="mt-1">
                Si un jugador con plata REAL le gana a una apuesta pagada con
                este saldo, el premio sale de tu ganancia:{" "}
                <strong className="text-lose-glow">−S/0.80</strong> por cada sol
                emparejado.
              </p>
              <p className="mt-1">
                Si la apuesta fake le gana a una real, el jugador pierde su
                plata de verdad y tú te quedas con ella:{" "}
                <strong className="text-win-glow">+S/1.00</strong> por sol.
              </p>
            </div>

            <label htmlFor="monto-fake" className="mt-4 mb-1.5 block text-sm text-parchment/80">
              Cuánto sumarle (S/)
            </label>
            <input
              id="monto-fake"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={montoFake}
              onChange={(e) => setMontoFake(e.target.value)}
              placeholder="Ej. 50"
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <label htmlFor="motivo-fake" className="mt-3 mb-1.5 block text-sm text-parchment/80">
              Motivo
            </label>
            <input
              id="motivo-fake"
              value={motivoFake}
              onChange={(e) => setMotivoFake(e.target.value)}
              placeholder="Ej. Cuenta de relleno para que haya con quién emparejar"
              className="w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                disabled={
                  procesando === dandoFake.id ||
                  montoFake === "" ||
                  Number(montoFake) === 0 ||
                  Number.isNaN(Number(montoFake)) ||
                  motivoFake.trim().length < 3
                }
                onClick={() => aplicarSaldoFake(dandoFake)}
                className="flex-1"
              >
                {procesando === dandoFake.id ? "Guardando…" : "Dar saldo fake"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDandoFake(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmarReinicio ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reiniciar la plataforma"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmarReinicio(false);
              setTextoConfirmacion("");
            }
          }}
        >
          <div className="panel-stone w-full max-w-md rounded-xl p-5">
            <h2 className="font-fantasy text-lg font-bold text-lose-glow">
              Reiniciar la plataforma
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              Borra <strong className="text-parchment/90">todos</strong> los
              usuarios (cuenta y saldo), su historial de apuestas, sus
              recargas y retiros, y también los títulos/salas creados. Los
              rankings quedan en cero porque los usuarios que los formaban
              ya no existen. No se puede deshacer.
            </p>

            <label
              htmlFor="confirmar-reinicio"
              className="mt-4 mb-1.5 block text-sm text-parchment/80"
            >
              Escribe REINICIAR para confirmar
            </label>
            <input
              id="confirmar-reinicio"
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
            />

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="lose"
                disabled={reiniciando || textoConfirmacion !== "REINICIAR"}
                onClick={handleReiniciarPlataforma}
                className="flex-1"
              >
                {reiniciando ? "Reiniciando…" : "Reiniciar todo"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirmarReinicio(false);
                  setTextoConfirmacion("");
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-md border border-gold-dark/40 bg-obsidian/40 px-2 py-1.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-parchment/40">{label}</p>
      <p className="font-fantasy text-sm font-bold text-parchment/80">{valor}</p>
    </div>
  );
}

export default function AdminUsuariosPage() {
  return (
    <RequireAdmin>
      <AdminUsuariosContent />
    </RequireAdmin>
  );
}
