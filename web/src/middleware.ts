import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { isDashboardPath, legacyDashboardTarget } from "./lib/admin/paths";
import { SESSION_COOKIE, verifySessionToken } from "./lib/admin/session";

const intl = createMiddleware(routing);

export default async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Old un-prefixed admin URLs land on the Arabic admin.
  const legacy = legacyDashboardTarget(pathname);
  if (legacy) return NextResponse.redirect(new URL(legacy + search, req.url), 307);

  // Pages and the Server Action POSTs made from them need a signed-in session.
  if (isDashboardPath(pathname)) {
    const signedIn = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.ADMIN_PASSWORD);
    if (!signedIn) {
      if (req.method !== "GET" && req.method !== "HEAD") return new NextResponse("Sign in required", { status: 401 });
      const login = new URL(`/${pathname.slice(1, 3)}/login`, req.url);
      login.searchParams.set("next", pathname + search);
      return NextResponse.redirect(login, 307);
    }
  }
  return intl(req);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
  // Node runtime so ADMIN_PASSWORD is read from the server's env per request.
  runtime: "nodejs",
};
