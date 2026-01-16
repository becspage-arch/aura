import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

function isResponseLike(x: any): x is Response {
  return !!x && typeof x === "object" && x.headers && typeof x.headers.get === "function";
}

export default clerkMiddleware((auth, req) => {
  const { pathname } = new URL(req.url);

  /* =====================================================
     AURA COMING SOON PASSWORD GATE (NEW)
     ===================================================== */

  // Always allow Next internals & static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap")
  ) {
    return NextResponse.next();
  }

  // Allow gate page + unlock endpoint
  if (
    pathname === "/gate" ||
    pathname === "/api/gate/unlock"
  ) {
    return NextResponse.next();
  }

  // Check gate cookie
  const isUnlocked = req.cookies.get("aura_gate")?.value === "1";

  if (!isUnlocked) {
    // Redirect EVERYTHING to /gate until unlocked
    const url = new URL(req.url);
    url.pathname = "/gate";
    return NextResponse.redirect(url);
  }

  /* =====================================================
     EXISTING LOGIC (UNCHANGED)
     ===================================================== */

  // DEV-only: allow seed + chart data endpoints without auth (LOCALHOST ONLY)
  if (process.env.NODE_ENV !== "production") {
    const host = req.headers?.get?.("host") ?? "";
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");

    if (isLocal) {
      if (pathname.startsWith("/api/dev/seed/")) return NextResponse.next();
      if (pathname.startsWith("/api/charts/")) return NextResponse.next();
    }
  }

  // Public routes (still public AFTER gate unlock)
  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/sign-out")
  ) {
    return NextResponse.next();
  }

  // Let Clerk do its thing, but only return it if it's a real Response
  const maybe = auth.protect();
  if (isResponseLike(maybe)) return maybe;

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
