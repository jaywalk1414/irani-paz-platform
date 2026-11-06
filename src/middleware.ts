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