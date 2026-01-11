/**
 * Proxy for Clerk authentication
 * 
 * Migrated from middleware.ts to proxy.ts per Next.js 16 convention.
 * This file handles authentication and route protection using Clerk.
 * 
 * See: https://clerk.com/docs/nextjs/middleware
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/middleware
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/",
  "/api/webhooks(.*)", // Webhook endpoints should be public
]);

export default clerkMiddleware(async (auth, request) => {
  // Only protect non-public routes
  if (!isPublicRoute(request)) {
    await auth.protect();
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
