import { notFound } from "next/navigation";

/**
 * Server-side client for /api/v1/admin/*. Never import this from a client
 * component: it reads ADMIN_PASSWORD from the server environment.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function apiBase(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
}

function authorization(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not set for the web app (see .env)");
  return "Basic " + Buffer.from(`admin:${password}`, "utf8").toString("base64");
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorization());
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  const res = await fetch(`${apiBase()}/api/v1/admin${path}`, { ...init, headers, cache: "no-store" });
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `The API answered ${res.status}`,
    );
  }
  return body as T;
}

export function adminGet<T>(path: string): Promise<T> {
  return adminFetch<T>(path);
}

export function adminSend<T = unknown>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const payload = body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body);
  return adminFetch<T>(path, { method, body: payload });
}

/** GET that turns an API 404 into the dashboard's not-found page. */
export async function getOr404<T>(path: string): Promise<T> {
  try {
    return await adminFetch<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
