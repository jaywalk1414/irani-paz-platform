import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '@/app/(app)/actions';
import { auth } from '../../../../auth';

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<OwnerLayoutFallback />}>
      <OwnerLayoutContent>{children}</OwnerLayoutContent>
    </Suspense>
  );
}

async function OwnerLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) redirect('/login');
  if (session.user.role !== 'owner') redirect('/after-login');

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9F6]">
      <header className="sticky top-0 z-40 border-b border-[#E5E9E5] bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/owner/dashboard" className="flex items-center gap-2">
              <span className="font-bold text-[#234B3B]">شبستان</span>
              <span className="rounded-md bg-[#F7F5EF] px-2 py-0.5 text-xs font-medium text-[#737B75]">
                مالک
              </span>
            </Link>

            <nav className="hidden gap-1 text-sm sm:flex">
              <NavLink href="/owner/dashboard">داشبورد</NavLink>
              <NavLink href="/owner/menu">منو</NavLink>
              <NavLink href="/owner/availability">موجودی</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm text-[#737B75]">
            <span className="hidden sm:inline">{session.user.name}</span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-[#E5E9E5] bg-white px-3 py-1.5 text-xs font-medium text-[#252B28] transition-colors duration-150 hover:border-[#D9534F] hover:text-[#D9534F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
              >
                خروج از حساب
              </button>
            </form>
          </div>
        </div>

        <nav className="flex gap-1 border-t border-[#E5E9E5] px-4 py-1.5 text-sm sm:hidden">
          <NavLink href="/owner/dashboard">داشبورد</NavLink>
          <NavLink href="/owner/menu">منو</NavLink>
          <NavLink href="/owner/availability">موجودی</NavLink>
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

function OwnerLayoutFallback() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9F6]">
      <header className="h-14 border-b border-[#E5E9E5] bg-white">
        <div className="mx-auto flex h-full max-w-6xl items-center px-4">
          <span className="font-bold text-[#234B3B]">شبستان</span>
        </div>
      </header>
      <main className="flex-1" />
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-[#737B75] transition-colors duration-150 hover:bg-[#F7F5EF] hover:text-[#234B3B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234B3B]/40"
    >
      {children}
    </Link>
  );
}