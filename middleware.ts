import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

function isResponseLike(x: any): x is Response {
  return !!x && typeof x === "object" && x.headers && typeof x.headers.get === "function";
}

export default clerkMiddleware((auth, req) => {
  const { pathname } = new URL(req.url);

  // DEV-only: allow seed + chart data endpoints without auth (LOCALHOST ONLY)
  if (process.env.NODE_ENV !== "production") {
    const host = req.headers?.get?.("host") ?? "";
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");

    if (isLocal) {
      if (pathname.startsWith("/api/dev/seed/")) return NextResponse.next();
      if (pathname.startsWith("/api/charts/")) return NextResponse.next();
    }
  }

  // Public routes
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
