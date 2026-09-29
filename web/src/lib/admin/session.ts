/**
 * Admin sign-in. A session is a signed cookie "<expiry ms>.<HMAC-SHA256>",
 * keyed by the admin password, so changing the password signs everyone out.
 * Web Crypto only: runs in middleware, Server Actions and node tests alike.
 */

export const SESSION_COOKIE = "sahel_admin";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(`sahel-admin:${payload}`)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now(), ttl = SESSION_TTL_MS): Promise<string> {
  const expiry = String(now + ttl);
  return `${expiry}.${await sign(expiry, secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiry = token.slice(0, dot);
  if (!/^\d+$/.test(expiry) || Number(expiry) <= now) return false;
  return constantTimeEqual(token.slice(dot + 1), await sign(expiry, secret));
}

/** An unset password rejects everyone. Both parts are compared in constant time. */
export function checkCredentials(username: string, password: string, expectedUser: string, expectedPassword: string | undefined): boolean {
  if (!expectedPassword) return false;
  const userOk = constantTimeEqual(username, expectedUser);
  const passOk = constantTimeEqual(password, expectedPassword);
  return userOk && passOk;
}

/** Where to go after signing in: only a path inside this locale's dashboard. */
export function safeNext(locale: "ar" | "en", next: string | null | undefined): string {
  const home = `/${locale}/dashboard`;
  if (!next || !next.startsWith(home) || next.startsWith("//")) return home;
  const rest = next.slice(home.length);
  return rest === "" || rest.startsWith("/") || rest.startsWith("?") ? next : home;
}
