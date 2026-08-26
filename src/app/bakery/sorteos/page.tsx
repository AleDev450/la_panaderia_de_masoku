"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RequireAdmin } from "@/components/RequireAdmin";
import { Header } from "@/components/Header";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import {
  InscripcionConUsuario,
  SorteoConInscripcion,
  asignarTickets,
  getInscripciones,
  getSorteos,
  guardarSorteo,
  marcarGanador,
  sortearGanador,
} from "@/actions/sorteos";
import { Sorteo } from "@/lib/supabase/types";
import { COLORES, PasosNumerados, parsearBloques } from "@/lib/markdown";

/** Lo que rellena el botón "Rellenar con un ejemplo" y lo que se muestra de
 * placeholder: enseña el formato entero (bloques, color y link) de una. */
const EJEMPLO_INSTRUCCIONES = `Compra mi bundle en Dota
{azul:Brillante}: 1 ticket | {morado:Holográfico}: 2 tickets | {oro:Dorado}: 3 tickets

Asegúrate de tener tu inventario en público
Puedes ir a [Ajustes de privacidad de Steam](https://steamcommunity.com/my/edit/settings) y poner Inventario → Público.

Regístrate en el formulario
Ingresa tu perfil de Steam y tu usuario de Discord (para contactarte si ganas) en el formulario de la derecha.

Participación confirmada
Ya estarías participando en el sorteo.`;

/** Estado del formulario. `id` en null = se está creando uno nuevo. */
interface FormSorteo {
  id: string | null;
  nombre: string;
  premio: string;
  instrucciones: string;
  fechaSorteo: string;
  activo: boolean;
}

const FORM_VACIO: FormSorteo = {
  id: null,
  nombre: "",
  premio: "",
  instrucciones: "",
  fechaSorteo: "",
  activo: true,
};

function desdeSorteo(s: Sorteo): FormSorteo {
  return {
    id: s.id,
    nombre: s.nombre,
    premio: s.premio,
    instrucciones: s.instrucciones ?? "",
    fechaSorteo: s.fecha_sorteo ?? "",
    activo: s.activo,
  };
}

function AdminSorteosContent() {
  const { showToast } = useToast();
  const [sorteos, setSorteos] = useState<SorteoConInscripcion[] | null>(null);
  const [form, setForm] = useState<FormSorteo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Qué sorteo tiene la lista de inscritos abierta, y sus filas ya cargadas.
  const [abierto, setAbierto] = useState<string | null>(null);
  const [inscritos, setInscritos] = useState<InscripcionConUsuario[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  // Los tickets se escriben en un input por fila; esto guarda lo tipeado
  // antes de mandarlo, por inscripción.
  const [ticketsEditados, setTicketsEditados] = useState<Record<string, string>>({});
  const [sorteando, setSorteando] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getSorteos();
    setSorteos(result.ok ? result.data : []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time bootstrap on mount
    refresh();
  }, [refresh]);

  const cargarInscritos = useCallback(async (sorteoId: string) => {
    setInscritos(null);
    const result = await getInscripciones(sorteoId);
    const filas = result.ok ? result.data : [];
    setInscritos(filas);
    setTicketsEditados(
      Object.fromEntries(filas.map((f) => [f.inscripcion.id, String(f.inscripcion.tickets)]))
    );
  }, []);

  async function handleGuardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setError(undefined);
    setGuardando(true);
    try {
      const result = await guardarSorteo({
        sorteoId: form.id,
        nombre: form.nombre,
        premio: form.premio,
        instrucciones: form.instrucciones,
        fechaSorteo: form.fechaSorteo,
        activo: form.activo,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      showToast({
        variant: "success",
        title: form.id ? "Sorteo actualizado" : "Sorteo publicado",
        description: `${result.data.nombre} — ${result.data.premio}.`,
      });
      setForm(null);
      await refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function alternarGanador(fila: InscripcionConUsuario) {
    setProcesando(fila.inscripcion.id);
    try {
      const result = await marcarGanador({
        inscripcionId: fila.inscripcion.id,
        ganador: !fila.inscripcion.ganador,
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo marcar", description: result.error });
        return;
      }
      showToast({
        variant: "info",
        title: result.data.ganador ? "Ganador marcado" : "Ganador desmarcado",
        description: fila.usuario.nickname,
      });
      if (abierto) await cargarInscritos(abierto);
    } finally {
      setProcesando(null);
    }
  }

  async function guardarTickets(fila: InscripcionConUsuario) {
    setProcesando(fila.inscripcion.id);
    try {
      const result = await asignarTickets({
        inscripcionId: fila.inscripcion.id,
        tickets: Number(ticketsEditados[fila.inscripcion.id] ?? 0),
      });
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo guardar", description: result.error });
        return;
      }
      showToast({
        variant: "success",
        title: "Tickets guardados",
        description: `${fila.usuario.nickname}: ${result.data.tickets} ticket(s).`,
      });
      if (abierto) await cargarInscritos(abierto);
    } finally {
      setProcesando(null);
    }
  }

  async function handleSortear(sorteoId: string) {
    setSorteando(true);
    try {
      const result = await sortearGanador(sorteoId);
      if (!result.ok) {
        showToast({ variant: "warning", title: "No se pudo sortear", description: result.error });
        return;
      }
      const nombre =
        (inscritos ?? []).find((f) => f.inscripcion.id === result.data.id)?.usuario.nickname ??
        "Alguien";
      showToast({
        variant: "success",
        title: "¡Tenemos ganador!",
        description: `${nombre} — salió con ${result.data.tickets} ticket(s).`,
      });
      await cargarInscritos(sorteoId);
      await refresh();
    } finally {
      setSorteando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-fantasy text-3xl font-bold text-parchment">Sorteos</h1>
            <p className="mt-2 text-sm text-parchment/60">
              Publica un sorteo, revisa quién se inscribió y marca a los
              ganadores. Los jugadores dejan su Steam y su Discord en /sorteos.
            </p>
          </div>
          {form === null ? (
            <Button type="button" onClick={() => setForm(FORM_VACIO)}>
              Nuevo sorteo
            </Button>
          ) : null}
        </div>

        {form !== null ? (
          <Panel className="mt-6 p-5">
            <h2 className="font-fantasy text-lg font-semibold text-gold-light">
              {form.id ? "Editar sorteo" : "Nuevo sorteo"}
            </h2>

            <form onSubmit={handleGuardar}>
              <label htmlFor="nombre" className="mt-4 mb-1.5 block text-sm text-parchment/80">
                Nombre
              </label>
              <input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Sorteo Carmesí"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />

              <label htmlFor="premio" className="mt-3 mb-1.5 block text-sm text-parchment/80">
                Qué se sortea
              </label>
              <input
                id="premio"
                value={form.premio}
                onChange={(e) => setForm({ ...form, premio: e.target.value })}
                placeholder="Ej. un cofre Carmesí"
                className="min-h-11 w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />

              <div className="mt-3 mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="instrucciones" className="block text-sm text-parchment/80">
                  Cómo participar
                </label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, instrucciones: EJEMPLO_INSTRUCCIONES })}
                  className="text-[11px] font-semibold text-gold-light underline"
                >
                  Rellenar con un ejemplo
                </button>
              </div>
              <textarea
                id="instrucciones"
                rows={10}
                value={form.instrucciones}
                onChange={(e) => setForm({ ...form, instrucciones: e.target.value })}
                placeholder={EJEMPLO_INSTRUCCIONES}
                className="w-full rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 font-mono text-xs leading-relaxed text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
              />

              <div className="mt-2 rounded-md border border-gold-dark/40 bg-obsidian/40 p-3 text-[11px] leading-relaxed text-parchment/50">
                <p>
                  <strong className="text-parchment/80">Un paso por bloque</strong>, separados por
                  una línea en blanco. La primera línea del bloque es el título; lo que sigue, el
                  detalle en letra chica.
                </p>
                <p className="mt-1.5">
                  <code className="text-parchment/80">**negrita**</code> ·{" "}
                  <code className="text-parchment/80">[texto](https://link)</code> ·{" "}
                  <code className="text-parchment/80">{"{color:texto}"}</code>
                </p>
                <p className="mt-1.5">
                  Colores:{" "}
                  {Object.entries(COLORES).map(([nombre, clase], i) => (
                    <span key={nombre}>
                      {i > 0 ? " · " : ""}
                      <code className={clase}>{nombre}</code>
                    </span>
                  ))}
                </p>
                <p className="mt-1.5">Si lo dejas vacío se muestran unos pasos genéricos.</p>
              </div>

              {form.instrucciones.trim() ? (
                <div className="mt-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wide text-parchment/40">
                    Vista previa — así lo ve el jugador
                  </p>
                  <div className="rounded-md border border-gold-dark/40 bg-obsidian/60 p-4">
                    <PasosNumerados bloques={parsearBloques(form.instrucciones)} />
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-end gap-4">
                <div>
                  <label htmlFor="fecha" className="mb-1.5 block text-sm text-parchment/80">
                    Fecha del sorteo (opcional)
                  </label>
                  <input
                    id="fecha"
                    type="date"
                    value={form.fechaSorteo}
                    onChange={(e) => setForm({ ...form, fechaSorteo: e.target.value })}
                    className="min-h-11 rounded-md border border-gold-dark bg-obsidian/60 px-3 py-2 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                  />
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm text-parchment/80">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                    className="h-4 w-4 accent-gold-light"
                  />
                  Abierto a inscripciones
                </label>
              </div>

              {error ? <p className="mt-3 text-sm text-lose-glow">{error}</p> : null}

              <div className="mt-5 flex gap-2">
                <Button
                  type="submit"
                  disabled={guardando || form.nombre.trim().length < 3 || form.premio.trim().length < 2}
                >
                  {guardando ? "Guardando…" : form.id ? "Guardar cambios" : "Publicar sorteo"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Panel>
        ) : null}

        <section className="mt-8">
          {sorteos === null ? (
            <p className="text-sm text-parchment/50">Cargando…</p>
          ) : sorteos.length === 0 ? (
            <Panel className="border-dashed p-8 text-center text-sm text-parchment/50">
              Todavía no publicaste ningún sorteo.
            </Panel>
          ) : (
            <div className="space-y-3">
              {sorteos.map(({ sorteo, inscritos: total }) => (
                <Panel key={sorteo.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-fantasy text-lg font-semibold text-parchment">
                          {sorteo.nombre}
                        </h3>
                        <span
                          className={clsx(
                            "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            sorteo.activo
                              ? "bg-win/20 text-win-glow"
                              : "bg-obsidian/60 text-parchment/40"
                          )}
                        >
                          {sorteo.activo ? "Abierto" : "Cerrado"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-parchment/60">
                        {sorteo.premio}
                        {sorteo.fecha_sorteo ? ` · se sortea el ${sorteo.fecha_sorteo}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-parchment/40">
                        {total === 1 ? "1 inscrito" : `${total} inscritos`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setForm(desdeSorteo(sorteo))}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          const siguiente = abierto === sorteo.id ? null : sorteo.id;
                          setAbierto(siguiente);
                          if (siguiente) cargarInscritos(siguiente);
                        }}
                        className="min-h-9 px-3 py-1 text-xs"
                      >
                        {abierto === sorteo.id ? "Ocultar inscritos" : "Ver inscritos"}
                      </Button>
                    </div>
                  </div>

                  {abierto === sorteo.id ? (
                    <div className="mt-4 border-t border-gold-dark/30 pt-4">
                      {inscritos === null ? (
                        <p className="text-sm text-parchment/50">Cargando inscritos…</p>
                      ) : inscritos.length === 0 ? (
                        <p className="text-sm text-parchment/50">
                          Nadie se ha inscrito todavía.
                        </p>
                      ) : (
                        <>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-parchment/50">
                              {inscritos.reduce((n, f) => n + f.inscripcion.tickets, 0)} tickets
                              en total · el sorteo es al azar ponderado, con 6 tickets tienes seis
                              veces la chance de alguien con 1.
                            </p>
                            <Button
                              type="button"
                              variant="win"
                              disabled={
                                sorteando ||
                                inscritos.every((f) => f.inscripcion.ganador || f.inscripcion.tickets === 0)
                              }
                              onClick={() => handleSortear(sorteo.id)}
                              className="min-h-9 px-3 py-1 text-xs"
                            >
                              {sorteando ? "Sorteando…" : "Sortear ganador"}
                            </Button>
                          </div>

                          <ul className="space-y-2">
                            {inscritos.map((fila) => {
                              const editado = ticketsEditados[fila.inscripcion.id] ?? "";
                              const cambiado = editado !== String(fila.inscripcion.tickets);
                              return (
                                <li
                                  key={fila.inscripcion.id}
                                  className={clsx(
                                    "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2",
                                    fila.inscripcion.ganador
                                      ? "border-win-glow/50 bg-win/5"
                                      : "border-gold-dark/30"
                                  )}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-parchment">
                                      {fila.usuario.nickname}
                                      {fila.inscripcion.ganador ? (
                                        <span className="ml-2 text-xs font-bold text-win-glow">
                                          GANADOR
                                        </span>
                                      ) : null}
                                    </p>
                                    <p className="text-xs text-parchment/50">
                                      Discord:{" "}
                                      <span className="font-mono text-parchment/70">
                                        {fila.inscripcion.discord}
                                      </span>
                                    </p>
                                    <a
                                      href={fila.inscripcion.steam_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block truncate text-xs text-gold-light underline"
                                    >
                                      {fila.inscripcion.steam_url}
                                    </a>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <label
                                      htmlFor={`tickets-${fila.inscripcion.id}`}
                                      className="text-[11px] uppercase tracking-wide text-parchment/40"
                                    >
                                      Tickets
                                    </label>
                                    <input
                                      id={`tickets-${fila.inscripcion.id}`}
                                      type="number"
                                      min={0}
                                      max={1000}
                                      step={1}
                                      inputMode="numeric"
                                      value={editado}
                                      onChange={(e) =>
                                        setTicketsEditados((prev) => ({
                                          ...prev,
                                          [fila.inscripcion.id]: e.target.value,
                                        }))
                                      }
                                      className="min-h-9 w-20 rounded-md border border-gold-dark bg-obsidian/60 px-2 py-1 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold-light"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      disabled={
                                        procesando === fila.inscripcion.id || !cambiado || editado === ""
                                      }
                                      onClick={() => guardarTickets(fila)}
                                      className="min-h-9 px-3 py-1 text-xs"
                                    >
                                      Guardar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={fila.inscripcion.ganador ? "ghost" : "win"}
                                      disabled={procesando === fila.inscripcion.id}
                                      onClick={() => alternarGanador(fila)}
                                      className="min-h-9 px-3 py-1 text-xs"
                                    >
                                      {fila.inscripcion.ganador ? "Quitar" : "Marcar ganador"}
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default function AdminSorteosPage() {
  return (
    <RequireAdmin>
      <AdminSorteosContent />
    </RequireAdmin>
  );
}
