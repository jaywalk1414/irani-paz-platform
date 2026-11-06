"use server";

import { cookies } from "next/headers";
import { signOut } from "../../../auth";

export async function logout() {
  const cookieStore = await cookies();
  const existing = cookieStore.getAll();

  for (const { name } of existing) {
    cookieStore.delete(name);
  }
  await signOut({ redirectTo: "/login" });
}
