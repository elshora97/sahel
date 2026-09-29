import { cookies } from "next/headers";

import type { Customer } from "./types";
import { apiUrl } from "./urls";

/**
 * Server-side calls made as the signed-in guest. The API's guest token lives
 * only in an HttpOnly cookie; the browser never sees or sends it itself.
 */

export const GUEST_COOKIE = "sahel_guest";
export const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export function apiBase(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8090";
}

export async function guestToken(): Promise<string | undefined> {
  return (await cookies()).get(GUEST_COOKIE)?.value;
}

export interface ApiReply<T> {
  status: number;
  body: T | null;
  code?: string;
}

/** Calls the public API with the guest's token when there is one. Never throws on 4xx. */
export async function guestFetch<T>(path: string, init: { method?: string; body?: unknown; query?: string } = {}): Promise<ApiReply<T>> {
  const headers: Record<string, string> = {};
  const token = await guestToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(apiUrl(apiBase(), path, init.query ?? ""), {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (res.status >= 500) throw new Error(`API ${path} answered ${res.status}`);
  return res.ok ? { status: res.status, body: json as T } : { status: res.status, body: null, code: json?.error?.code ?? "error" };
}

/** The signed-in guest, or null. */
export async function currentGuest(): Promise<Customer | null> {
  if (!(await guestToken())) return null;
  const r = await guestFetch<Customer>("/me");
  return r.body;
}
