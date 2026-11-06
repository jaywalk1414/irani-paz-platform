'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signOut } from '../../../auth';

export async function logout() {
  await signOut({ redirect: false });

  const cookieStore = await cookies(); 
  const existingCookies = cookieStore.getAll(); 

  for (const { name } of existingCookies) {
    cookieStore.set(name, '', { maxAge: 0 });
  }

  redirect('/login');
}