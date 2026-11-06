import { NextResponse } from "next/server";
import {
  getBusinessContext,
  listMenuWithAvailability,
} from "@/lib/services/availability.service";
import { auth } from "../../../../../auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "waiter") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ctx = await getBusinessContext(session.user.restaurantId);
  const menu = await listMenuWithAvailability(
    session.user.restaurantId,
    ctx.businessDate,
  );

  return NextResponse.json({
    businessDate: ctx.businessDate,
    items: menu.map((m) => ({
      menuItemId: m.menuItemId,
      availableQuantity: m.availableQuantity,
      configuredQuantity: m.configuredQuantity,
    })),
  });
}
