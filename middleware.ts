// middleware.ts (ROOT)

import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

export const runtime = "edge";

function isResponseLike(x: any): x is Response {
  return !!x && typeof x === "object" && x.headers && typeof x.headers.get === "function";
}

export default clerkMiddleware((auth, req) => {
  const { pathname } = new URL(req.url);

  // Allow the worker ingest endpoint (worker has no Clerk session)
  if (pathname === "/api/internal/notifications/ingest") {
    const res = NextResponse.next();
    res.headers.set("x-aura-mw-ingest", "1");
    return res;
  }

  // Allow Next internals/static
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/sitemap")
  ) {
    return NextResponse.next();
  }

  // Allow gate routes
  if (pathname === "/gate" || pathname === "/api/gate/unlock") {
    return NextResponse.next();
  }

  // Gate cookie check
  const isUnlocked = req.cookies.get("aura_gate")?.value === "1";
  if (!isUnlocked) {
    const url = new URL(req.url);
    url.pathname = "/gate";
    return NextResponse.redirect(url);
  }

  // Public routes after gate
  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/sign-out")
  ) {
    return NextResponse.next();
  }

  // Everything else requires Clerk auth
  const maybe = auth.protect();
  if (isResponseLike(maybe)) return maybe;

  return NextResponse.next();
});

export const config = {
  matcher: ["/:path*"],
};
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
