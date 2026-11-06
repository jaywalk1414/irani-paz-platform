import Image from 'next/image';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { homeForRole } from '@/lib/routes';
import { LoginForm } from './login-form';
import { auth } from '../../../auth';

export const metadata: Metadata = {
  title: 'ورود کارکنان',
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect(homeForRole(session.user.role));

  return (
    <main
      dir="rtl"
      lang="fa"
      className="grid min-h-dvh bg-[#F8F9F6] lg:grid-cols-2"
    >
      <div className="relative hidden bg-[#234B3B] lg:block">
        <div className="relative m-52 h-[calc(100%-26rem)] w-[calc(100%-26rem)] overflow-hidden rounded-2xl">
          <Image
            src="/imgs/login-banner.jpg"
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover"
          />
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <LoginForm />
      </div>
    </main>
  );
}