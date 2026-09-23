import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { basicAuthChallenge, isAuthorized } from "./lib/admin/auth";

const intl = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    // Covers pages and the Server Action POSTs made from them.
    if (!isAuthorized(req.headers.get("authorization"), process.env.ADMIN_PASSWORD)) {
      return new NextResponse("Admin password required", basicAuthChallenge);
    }
    return NextResponse.next();
  }
  return intl(req);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
  // Node runtime so ADMIN_PASSWORD is read from the server's env per request.
  runtime: "nodejs",
};
