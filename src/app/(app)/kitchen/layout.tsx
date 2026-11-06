import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/(app)/actions";
import { auth } from "../../../../auth";

export default async function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "kitchen" && session.user.role !== "owner") {
    redirect("/after-login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9F6] text-[#252B28]">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[#E5E9E5] bg-white px-4">
        <Link href="/kitchen/orders" className="flex items-center gap-2">
          <span className="font-bold text-[#234B3B]">شبستان</span>
          <span className="rounded-md bg-[#F7F5EF] px-2 py-0.5 text-xs font-medium text-[#737B75]">
            آشپزخانه
          </span>
        </Link>
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
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
