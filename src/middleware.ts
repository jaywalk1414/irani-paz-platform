import NextAuth from "next-auth";
import { authConfig } from "../auth.config";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

console.log("[AUTH DEBUG]", {
  hasAuthSecret: Boolean(process.env.AUTH_SECRET),
  hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
  nodeEnv: process.env.NODE_ENV,
});

const { auth } = NextAuth(authConfig);

const authMiddleware = auth((req) => {
  console.log("[AUTH MIDDLEWARE]", {
    hasSecret: Boolean(process.env.AUTH_SECRET),
  });

  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isAuthRoute = nextUrl.pathname.startsWith("/api/auth");
  const isPublic =
    nextUrl.pathname === "/login" ||
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname === "/favicon.ico";

  if (isAuthRoute || isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    const login = new URL("/login", nextUrl);
    login.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
});

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent,
) {
  // ⚠️ MUST run before authMiddleware — otherwise the auth wrapper
  // either redirects to /login (logged out) or calls next() (logged in),
  // and the Set-Cookie headers never make it past OpenNext's proxy.
  if (req.nextUrl.pathname === "/api/logout") {
    const response = NextResponse.redirect(new URL("/login", req.url));

    // Cookies to clear. The unprefixed variants are no-ops in production
    // but make logout work on localhost (HTTP doesn't allow __Secure-/__Host-).
    const cookiesToClear = [
      { name: "__Host-authjs.csrf-token", secure: true },
      { name: "__Secure-authjs.callback-url", secure: true },
      { name: "__Secure-authjs.session-token", secure: true },
      { name: "authjs.csrf-token", secure: false },
      { name: "authjs.callback-url", secure: false },
      { name: "authjs.session-token", secure: false },
    ];

    // Use headers.append() — NOT response.cookies.set().
    // OpenNext Cloudflare folds multiple cookies.set() calls into a single
    // malformed Set-Cookie header, causing the browser to ignore them.
    for (const { name, secure } of cookiesToClear) {
      const attrs = [
        "Max-Age=0",
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        secure ? "Secure" : null,
        // ⚠️ NO Domain attribute — required for the __Host- prefix.
      ]
        .filter(Boolean)
        .join("; ");

      response.headers.append("Set-Cookie", `${name}=; ${attrs}`);
    }

    return response;
  }

  const handler = (await authMiddleware) as unknown as (
    req: NextRequest,
    event: NextFetchEvent,
  ) => Promise<Response> | Response;
  return handler(req, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg)$).*)",
  ],
};
