import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(app)/actions';
import { auth } from '../../../../auth';

export default async function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'kitchen' && session.user.role !== 'owner') {
    redirect('/after-login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-900 text-zinc-100">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-4 backdrop-blur">
        <Link href="/kitchen/orders" className="flex items-center gap-2">
          <span className="font-semibold">Shabestan</span>
          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
            Kitchen
          </span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="hidden sm:inline">{session.user.name}</span>
          <form action={logout}>
            <button className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}