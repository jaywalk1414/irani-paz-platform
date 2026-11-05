import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(app)/actions';
import { auth } from '../../../../auth';

export default async function WaiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'waiter') redirect('/after-login');

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-white px-4">
        <Link href="/waiter/dashboard" className="flex items-center gap-2">
          <span className="font-semibold">Shabestan</span>
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            Waiter
          </span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-zinc-600">
          <span className="hidden sm:inline">{session.user.name}</span>
          <form action={logout}>
            <button className="rounded border px-2 py-1 text-xs hover:bg-zinc-100">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}