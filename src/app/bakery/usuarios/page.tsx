"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { LevelBadge } from "@/components/LevelBadge";
import { useToast } from "@/context/ToastContext";
import { UsuarioAdmin, banearUsuario, eliminarUsuario, getUsuarios } from "@/actions/admin";

function AdminUsuariosContent() {
  const { showToast } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<UsuarioAdmin | null>(null);
  const [motivo, setMotivo] = useState("");
  const [eliminando, setEliminando] = useState<UsuarioAdmin | null>(null);

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
    if (!q) return usuarios ?? [];
    return (usuarios ?? []).filter(
      (u) =>
        u.nickname.toLowerCase().includes(q) ||
        (u.fullName ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").includes(q)
    );
  }, [usuarios, busqueda]);

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

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-fantasy text-3xl font-bold text-parchment">Usuarios</h1>
        <p className="mt-2 text-sm text-parchment/60">
          Suspender una cuenta no borra nada: el usuario conserva su saldo e
          historial, solo deja de poder apostar.
        </p>

        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nickname, nombre o teléfono"
          aria-label="Buscar usuario"
          className="mt-6 min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
        />

        <section className="mt-6">
          {usuarios === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : filtrados.length === 0 ? (
            <Panel className="border-dashed p-6 text-center text-sm text-parchment/50">
              {busqueda ? "Ningún usuario coincide." : "Todavía no hay usuarios registrados."}
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {filtrados.map((u) => (
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
                      </p>
                      {u.fullName ? (
                        <p className="text-sm text-parchment/80">{u.fullName}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-parchment/50">
                        Tel. {u.phone || "—"} · desde{" "}
                        {new Date(u.createdAt).toLocaleDateString("es-PE")}
                      </p>
                      {u.baneado && u.baneadoMotivo ? (
                        <p className="mt-1 text-xs text-lose-glow">Motivo: {u.baneadoMotivo}</p>
                      ) : null}
                    </div>
                    <LevelBadge puntos={u.puntos} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Dato label="Disponible" valor={`S/${u.saldoDisponible}`} />
                    <Dato label="En juego" valor={`S/${u.saldoRetenido}`} />
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
                      onClick={() => setEliminando(u)}
                      className="min-h-9 border border-lose-glow/40 px-3 py-1 text-xs text-lose-glow"
                    >
                      Eliminar cuenta
                    </Button>
                  </div>
                </Panel>
              ))}
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
