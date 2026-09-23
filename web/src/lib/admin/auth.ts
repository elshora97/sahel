/**
 * HTTP Basic check for /dashboard (spec §6). Mirrors the Go API: the
 * username is ignored and an unset password rejects everyone.
 */
export function isAuthorized(header: string | null, password: string | undefined): boolean {
  if (!password || !header || !header.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    const binary = atob(header.slice("Basic ".length).trim());
    decoded = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  return constantTimeEqual(decoded.slice(colon + 1), password);
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export const basicAuthChallenge = {
  status: 401,
  headers: { "WWW-Authenticate": 'Basic realm="sahel-admin", charset="UTF-8"' },
};
