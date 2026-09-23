import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { basicAuthChallenge, isAuthorized } from "./lib/admin/auth";
import { isDashboardPath, legacyDashboardTarget } from "./lib/admin/paths";

const intl = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Old un-prefixed admin URLs land on the Arabic admin.
  const legacy = legacyDashboardTarget(pathname);
  if (legacy) return NextResponse.redirect(new URL(legacy + search, req.url), 307);

  // Pages and the Server Action POSTs made from them.
  if (isDashboardPath(pathname) && !isAuthorized(req.headers.get("authorization"), process.env.ADMIN_PASSWORD)) {
    return new NextResponse("Admin password required", basicAuthChallenge);
  }
  return intl(req);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
  // Node runtime so ADMIN_PASSWORD is read from the server's env per request.
  runtime: "nodejs",
};
