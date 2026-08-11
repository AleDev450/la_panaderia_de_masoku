import { Recarga } from "@/types";

const RECARGAS_KEY = "lapanca:recargas";
const MONTO_MIN = 10;
const MONTO_MAX = 1000;

export class RecargaServiceError extends Error {}

function readRecargas(): Recarga[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECARGAS_KEY);
    return raw ? (JSON.parse(raw) as Recarga[]) : [];
  } catch {
    return [];
  }
}

function writeRecargas(recargas: Recarga[]) {
  window.localStorage.setItem(RECARGAS_KEY, JSON.stringify(recargas));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `recarga-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function validateMonto(monto: number): { valid: boolean; message?: string } {
  if (Number.isNaN(monto) || !Number.isFinite(monto)) {
    return { valid: false, message: "Ingresa un monto válido." };
  }
  if (monto < MONTO_MIN) {
    return { valid: false, message: `El monto mínimo de recarga es S/${MONTO_MIN}.` };
  }
  if (monto > MONTO_MAX) {
    return { valid: false, message: `El monto máximo de recarga es S/${MONTO_MAX}.` };
  }
  return { valid: true };
}

export interface CrearRecargaInput {
  userId: string;
  userNickname: string;
  monto: number;
  imagenDataUrl: string;
}

export async function crearRecarga(input: CrearRecargaInput): Promise<Recarga> {
  const validation = validateMonto(input.monto);
  if (!validation.valid) {
    throw new RecargaServiceError(validation.message);
  }
  if (!input.imagenDataUrl) {
    throw new RecargaServiceError(
      "Debes adjuntar una imagen del comprobante para saber la hora del depósito."
    );
  }

  const recarga: Recarga = {
    id: makeId(),
    userId: input.userId,
    userNickname: input.userNickname,
    monto: input.monto,
    imagenDataUrl: input.imagenDataUrl,
    estado: "pendiente",
    createdAt: new Date().toISOString(),
  };

  writeRecargas([recarga, ...readRecargas()]);
  return recarga;
}

async function updateEstado(
  id: string,
  estado: "aprobada" | "rechazada",
  revisadoPor: string
): Promise<Recarga> {
  const recargas = readRecargas();
  const index = recargas.findIndex((r) => r.id === id);
  if (index === -1) throw new RecargaServiceError("Recarga no encontrada.");
  if (recargas[index].estado !== "pendiente") {
    throw new RecargaServiceError("Esta recarga ya fue revisada.");
  }

  recargas[index] = {
    ...recargas[index],
    estado,
    revisadoPor,
    revisadoAt: new Date().toISOString(),
  };
  writeRecargas(recargas);
  return recargas[index];
}

export function aprobarRecarga(id: string, revisadoPor: string): Promise<Recarga> {
  return updateEstado(id, "aprobada", revisadoPor);
}

export function rechazarRecarga(id: string, revisadoPor: string): Promise<Recarga> {
  return updateEstado(id, "rechazada", revisadoPor);
}

export async function listRecargas(): Promise<Recarga[]> {
  return readRecargas();
}

export async function listRecargasByUser(userId: string): Promise<Recarga[]> {
  return readRecargas().filter((r) => r.userId === userId);
}
