import type { Metadata } from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css';

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'شبستان | مدیریت رستوران',
  description: 'سامانه مدیریت و عملیات رستوران',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body
        className={`${vazirmatn.className} flex min-h-full flex-col bg-[#F8F9F6] text-[#252B28]`}
      >
        {children}
      </body>
    </html>
  );
}