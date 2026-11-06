import { redirect } from "next/navigation";
import { homeForRole } from "@/lib/routes";
import { auth } from "../../auth";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(homeForRole(session.user.role));
}
