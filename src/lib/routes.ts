export const ROLE_HOME: Record<string, string> = {
  owner: '/owner/dashboard',
  waiter: '/waiter/dashboard',
  kitchen: '/kitchen/orders',
};

export function homeForRole(role: string | undefined | null): string {
  return (role && ROLE_HOME[role]) || '/login';
}