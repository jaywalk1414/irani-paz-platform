"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require";
import {
  markItemPreparing,
  markItemReady,
  cancelItem,
} from "@/lib/services/order.service";
import { OrderError } from "@/lib/services/errors";

export type ItemActionResult =
  | { ok: true }
  | { ok: false; code: string; error: string };

function ctxOf(user: Awaited<ReturnType<typeof requireRole>>) {
  return {
    restaurantId: user.restaurantId,
    branchId: user.branchId!,
    userId: user.id,
  };
}

function toResult(err: unknown): ItemActionResult {
  if (err instanceof OrderError) {
    return { ok: false, code: err.code, error: err.message };
  }
  return { ok: false, code: "UNKNOWN", error: "Something went wrong." };
}

function revalidateAll() {
  revalidatePath("/kitchen/orders");
  revalidatePath("/waiter/orders");
  revalidatePath("/waiter/dashboard");
}

export async function startItemAction(
  orderItemId: string,
): Promise<ItemActionResult> {
  const user = await requireRole(["kitchen", "owner"]);
  try {
    await markItemPreparing(ctxOf(user), orderItemId);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function readyItemAction(
  orderItemId: string,
): Promise<ItemActionResult> {
  const user = await requireRole(["kitchen", "owner"]);
  try {
    await markItemReady(ctxOf(user), orderItemId);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelItemAction(
  orderItemId: string,
  reason: string | null,
): Promise<ItemActionResult> {
  const user = await requireRole(["kitchen", "owner"]);
  try {
    await cancelItem(ctxOf(user), orderItemId, reason);
    revalidateAll();
    revalidatePath("/owner/availability");
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
