import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything NOT listed here will require auth
const isPublicRoute = createRouteMatcher([
  "/",                    // keep landing page public (optional)
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/health(.*)",      // keep your health endpoint public
  "/api/webhooks/clerk(.*)" // webhook must be public
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect(); // redirects unauthenticated users to sign-in automatically
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
