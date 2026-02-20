import { NextResponse } from "next/server";
import {
  clerkMiddleware,
  createRouteMatcher
} from "@clerk/nextjs/server";

export const runtime = "edge";

// Define which routes are public (NOT protected by Clerk)
const isPublicRoute = createRouteMatcher([
  "/api/internal/notifications/ingest",
  "/gate",
  "/api/gate/unlock",
  "/OneSignalSDKWorker.js",
  "/OneSignalSDKUpdaterWorker.js",
  "/manifest.json",
  "/favicon.ico",
  "/favicon(.*)",
  "/icons/(.*)",
]);

export default clerkMiddleware((auth, req) => {
  const { pathname } = new URL(req.url);

  // If it's public — skip Clerk protection entirely
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Everything else: require auth
  auth.protect();

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
