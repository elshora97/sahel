"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { safeLocale } from "@/lib/admin/paths";
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, apiBase, guestFetch, guestToken } from "@/lib/public/guest";
import { apiUrl } from "@/lib/public/urls";
import type { BookingView, Customer } from "@/lib/public/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; code: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function keepSession(token: string) {
  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
}

type SignedIn = { token: string; customer: Customer };

export async function signUp(name: string, phone: string, password: string): Promise<Result> {
  const r = await guestFetch<SignedIn>("/auth/register", {
    method: "POST",
    body: { name: String(name).slice(0, 100), phone: String(phone).slice(0, 40), password: String(password).slice(0, 200) },
  });
  if (!r.body) return { ok: false, code: r.code ?? "error" };
  await keepSession(r.body.token);
  return { ok: true };
}

export async function signIn(phone: string, password: string): Promise<Result> {
  const r = await guestFetch<SignedIn>("/auth/login", {
    method: "POST",
    body: { phone: String(phone).slice(0, 40), password: String(password).slice(0, 200) },
  });
  if (!r.body) return { ok: false, code: r.code ?? "error" };
  await keepSession(r.body.token);
  return { ok: true };
}

export async function bookStay(slug: string, checkIn: string, checkOut: string, guests: number): Promise<Result<{ ref: string }>> {
  if (!DATE.test(checkIn) || !DATE.test(checkOut) || !Number.isInteger(guests)) return { ok: false, code: "invalid_range" };
  const r = await guestFetch<BookingView>("/bookings", {
    method: "POST",
    body: { unit_slug: slug, check_in: checkIn, check_out: checkOut, guests },
  });
  return r.body ? { ok: true, ref: r.body.ref } : { ok: false, code: r.code ?? "error" };
}

export async function signOutGuest(locale: string): Promise<void> {
  (await cookies()).delete(GUEST_COOKIE);
  redirect(`/${safeLocale(locale)}`);
}

const REF = /^BES-[0-9A-HJKMNP-TV-Z]{5}$/;

/** Sends the guest's InstaPay receipt to the API, as the booking owner or with the phone's last 4 digits. */
export async function uploadReceipt(ref: string, form: FormData): Promise<Result> {
  if (!REF.test(ref)) return { ok: false, code: "not_found" };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: "file_required" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, code: "file_too_large" };
  const body = new FormData();
  body.set("file", file, file.name || "receipt");
  for (const key of ["sender_name", "sender_number", "phone_last4"]) body.set(key, String(form.get(key) ?? "").slice(0, 120));
  const headers: Record<string, string> = {};
  const token = await guestToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(apiBase(), `/bookings/${ref}/payments`), { method: "POST", headers, body, cache: "no-store" });
  if (res.ok) return { ok: true };
  const json = await res.json().catch(() => null);
  if (res.status >= 500) throw new Error(`receipt upload answered ${res.status}`);
  return { ok: false, code: json?.error?.code ?? "error" };
}
