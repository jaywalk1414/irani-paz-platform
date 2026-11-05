import { forbidden, unauthorized } from 'next/navigation';
import { auth } from '../../../auth';

export type AppRole = 'owner' | 'waiter' | 'kitchen';

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) unauthorized();
  return session.user;
}

export async function requireRole(allowed: AppRole[]) {
  const user = await requireAuth();
  if (!allowed.includes(user.role)) forbidden();
  return user;
}

/** Tenant guard: never trust a restaurantId from the client. */
export async function requireTenant() {
  const user = await requireAuth();
  return {
    user,
    restaurantId: user.restaurantId,
    branchId: user.branchId,
  };
}