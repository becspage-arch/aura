import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

export const runtime = "edge";

function isResponseLike(x: any): x is Response {
  return !!x && typeof x === "object" && x.headers && typeof x.headers.get === "function";
}

// Create the Clerk middleware once
const clerkMw = clerkMiddleware((auth, req) => {
  const { pathname } = new URL(req.url);

  // DIAGNOSTIC: prove middleware runs on production for "/"
  if (pathname === "/") {
    const res = NextResponse.next();
    res.headers.set("x-aura-mw", "1");
    return res;
  }

  /* =====================================================
     ALWAYS ALLOW SERVICE WORKERS + PWA ASSETS
     ===================================================== */

  if (
    pathname === "/OneSignalSDKWorker.js" ||
    pathname === "/OneSignalSDKUpdaterWorker.js" ||
    pathname === "/manifest.json" ||
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  /* =====================================================
     ALWAYS ALLOW API DATA ENDPOINTS (DEV ONLY, LOCALHOST)
     ===================================================== */

  if (process.env.NODE_ENV !== "production") {
    const host = req.headers?.get?.("host") ?? "";
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");

    if (isLocal) {
      if (pathname.startsWith("/api/dev/seed/")) return NextResponse.next();
      if (pathname.startsWith("/api/charts/")) return NextResponse.next();
    }
  }

  /* =====================================================
     NEXT INTERNALS & STATIC ASSETS
     ===================================================== */

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap")
  ) {
    return NextResponse.next();
  }

  /* =====================================================
     AURA COMING SOON PASSWORD GATE
     ===================================================== */

  if (pathname === "/gate" || pathname === "/api/gate/unlock") {
    return NextResponse.next();
  }

  const isUnlocked = req.cookies.get("aura_gate")?.value === "1";

  if (!isUnlocked) {
    const url = new URL(req.url);
    url.pathname = "/gate";
    return NextResponse.redirect(url);
  }

  /* =====================================================
     PUBLIC ROUTES (AFTER GATE)
     ===================================================== */

  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/sign-out")
  ) {
    return NextResponse.next();
  }

  /* =====================================================
     CLERK AUTH
     ===================================================== */

  const maybe = auth.protect();
  if (isResponseLike(maybe)) return maybe;

  return NextResponse.next();
});

// IMPORTANT: export our own middleware that SKIPS Clerk entirely for the worker endpoint.
export default function middleware(req: any, event: any) {
  const { pathname } = new URL(req.url);

  // Worker ingest must NOT be seen by Clerk at all.
  if (pathname === "/api/internal/notifications/ingest") {
    const res = NextResponse.next();
    res.headers.set("x-aura-mw-ingest", "1");
    return res;
  }

  return clerkMw(req, event);
}

export const config = {
  matcher: ["/:path*"],
};
