import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(app)/actions';
import { auth } from '../../../../auth';

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'owner') redirect('/after-login');

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/owner/dashboard" className="flex items-center gap-2">
              <span className="font-semibold">Shabestan</span>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                Owner
              </span>
            </Link>
            <nav className="hidden gap-1 text-sm sm:flex">
              <NavLink href="/owner/dashboard">Dashboard</NavLink>
              <NavLink href="/owner/menu">Menu</NavLink>
              <NavLink href="/owner/availability">Availability</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-600">
            <span className="hidden sm:inline">{session.user.name}</span>
            <form action={logout}>
              <button className="rounded border px-2 py-1 text-xs hover:bg-zinc-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 border-t px-4 py-1 text-sm sm:hidden">
          <NavLink href="/owner/dashboard">Dashboard</NavLink>
          <NavLink href="/owner/menu">Menu</NavLink>
          <NavLink href="/owner/availability">Availability</NavLink>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
    >
      {children}
    </Link>
  );
}