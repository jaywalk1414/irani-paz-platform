import NextAuth from 'next-auth';
import { authConfig } from '../auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(() => ({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  trustHost: true,
}));

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isAuthRoute = nextUrl.pathname.startsWith('/api/auth');
  const isPublic =
    nextUrl.pathname === '/login' ||
    nextUrl.pathname.startsWith('/_next') ||
    nextUrl.pathname === '/favicon.ico';

  if (isAuthRoute || isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    const login = new URL('/login', nextUrl);
    login.searchParams.set('callbackUrl', nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg)$).*)'],
};