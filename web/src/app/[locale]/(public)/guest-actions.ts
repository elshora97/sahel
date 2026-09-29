"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { safeLocale } from "@/lib/admin/paths";
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, guestFetch } from "@/lib/public/guest";
import type { BookingView, Customer } from "@/lib/public/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; code: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function requestCode(phone: string): Promise<Result<{ phone: string }>> {
  const r = await guestFetch<{ phone: string }>("/auth/otp/request", { method: "POST", body: { phone: String(phone).slice(0, 40) } });
  return r.body ? { ok: true, phone: r.body.phone } : { ok: false, code: r.code ?? "error" };
}

export async function verifyCode(phone: string, code: string): Promise<Result<{ needsName: boolean; name: string }>> {
  const r = await guestFetch<{ token: string; customer: Customer; needs_name: boolean }>("/auth/otp/verify", {
    method: "POST",
    body: { phone: String(phone).slice(0, 40), code: String(code).slice(0, 10) },
  });
  if (!r.body) return { ok: false, code: r.code ?? "error" };
  (await cookies()).set(GUEST_COOKIE, r.body.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
  return { ok: true, needsName: r.body.needs_name, name: r.body.customer.name };
}

export async function saveName(name: string): Promise<Result> {
  const r = await guestFetch<Customer>("/me", { method: "PATCH", body: { name: String(name).slice(0, 100) } });
  return r.body ? { ok: true } : { ok: false, code: r.code ?? "error" };
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
