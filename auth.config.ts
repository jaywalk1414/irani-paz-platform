import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.restaurantId = user.restaurantId;
        token.branchId = user.branchId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.restaurantId = token.restaurantId as string;
        session.user.branchId = (token.branchId ?? null) as string | null;
        session.user.role = token.role as 'owner' | 'waiter' | 'kitchen';
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
  providers: [],
} satisfies NextAuthConfig;