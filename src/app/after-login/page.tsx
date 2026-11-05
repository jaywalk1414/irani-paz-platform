import { redirect } from 'next/navigation';
import { auth } from '../../../auth';

const HOME: Record<string, string> = {
  owner: '/owner/dashboard',
  waiter: '/waiter/dashboard',
  kitchen: '/kitchen/orders',
};

export default async function AfterLogin() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  redirect(HOME[session.user.role] ?? '/login');
}