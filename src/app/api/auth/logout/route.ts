// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Derive the redirect target from the incoming request — works on
  // Cloudflare Workers, localhost, preview URLs, custom domains, etc.
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/login', origin));

  // Attributes required for the __Host- and __Secure- cookie prefixes.
  // httpOnly must match how Auth.js originally set them.
  const expire = {
    maxAge: 0,
    path: '/',
    secure: true,
    httpOnly: true,
  } as const;

  // __Host- prefix: Secure + Path=/ + NO Domain attribute.
  response.cookies.set('__Host-authjs.csrf-token', '', expire);

  // __Secure- prefix: Secure attribute required.
  response.cookies.set('__Secure-authjs.callback-url', '', expire);
  response.cookies.set('__Secure-authjs.session-token', '', expire);

  return response;
}