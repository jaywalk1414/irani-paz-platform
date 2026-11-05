import { DefaultSession } from 'next-auth';
import { JWT as DefaultJWT } from 'next-auth/jwt';

type AppRole = 'owner' | 'waiter' | 'kitchen';

declare module 'next-auth' {
  interface User {
    restaurantId: string;
    branchId: string | null;
    role: AppRole;
  }

  interface Session {
    user: {
      id: string;
      restaurantId: string;
      branchId: string | null;
      role: AppRole;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    restaurantId?: string;
    branchId?: string | null;
    role?: AppRole;
  }
}