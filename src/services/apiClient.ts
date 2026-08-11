/**
 * Thin fetch wrapper for the future REST API. Unused today — every
 * service in this folder reads/writes mocked data instead — but it keeps
 * one seam ready for when userService/betService swap their internals for
 * real HTTP calls. See README "Conectar una API REST".
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Error de red (${response.status})`);
  }

  return response.json() as Promise<T>;
}
