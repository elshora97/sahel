"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { safeLocale } from "@/lib/admin/paths";
import { SESSION_COOKIE, SESSION_TTL_MS, checkCredentials, createSessionToken, safeNext } from "@/lib/admin/session";

export type SignInState = { error: "invalid" | "unconfigured" } | null;

export async function signIn(locale: string, next: string, _: SignInState, fd: FormData): Promise<SignInState> {
  const l = safeLocale(locale);
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return { error: "unconfigured" };

  const ok = checkCredentials(
    String(fd.get("username") ?? "").trim(),
    String(fd.get("password") ?? ""),
    process.env.ADMIN_USERNAME || "admin",
    password,
  );
  if (!ok) {
    // Slows down guessing; the form shows one generic message either way.
    await new Promise((r) => setTimeout(r, 700));
    return { error: "invalid" };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  redirect(safeNext(l, next));
}

export async function signOut(locale: string): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect(`/${safeLocale(locale)}/login`);
}
