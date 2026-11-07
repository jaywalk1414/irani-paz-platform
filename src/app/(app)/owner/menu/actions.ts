"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/require";
import { db } from "@/lib/db/client";
import { menuItems } from "@/lib/db/schema";

export interface MenuActionResult {
  ok: boolean;
  error?: string;
  menuItemId?: string;
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(1000).optional(),
  ingredientsText: z.string().max(2000).optional(),
  priceToman: z.coerce.number().int().min(0, "Price must be ≥ 0."),
  prepTimeMinutes: z.coerce.number().int().min(1, "Prep time must be ≥ 1 min."),
  prepGroup: z.enum([
    "grill",
    "fryer",
    "stew_rice",
    "cold",
    "beverage",
    "other",
  ]),
  dailyQuantityDefault: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean().optional(),
});

function parseIngredients(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createMenuItemAction(
  _prev: MenuActionResult | null,
  formData: FormData,
): Promise<MenuActionResult> {
  const user = await requireRole(["owner"]);
  const parsed = itemSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    ingredientsText: formData.get("ingredients") || undefined,
    priceToman: formData.get("priceToman"),
    prepTimeMinutes: formData.get("prepTimeMinutes"),
    prepGroup: formData.get("prepGroup"),
    dailyQuantityDefault: formData.get("dailyQuantityDefault"),
    isActive: formData.get("isActive") === "on" ? true : false,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const [created] = await db
      .insert(menuItems)
      .values({
        restaurantId: user.restaurantId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        ingredients: parseIngredients(parsed.data.ingredientsText),
        priceToman: parsed.data.priceToman,
        prepTimeMinutes: parsed.data.prepTimeMinutes,
        prepGroup: parsed.data.prepGroup,
        dailyQuantityDefault: parsed.data.dailyQuantityDefault,
        isActive: parsed.data.isActive ?? true,
      })
      .returning({ id: menuItems.id });

    revalidatePath("/owner/menu");
    revalidatePath("/owner/dashboard");
    return { ok: true, menuItemId: created.id };
  } catch {
    return { ok: false, error: "Could not create the item." };
  }
}

export async function updateMenuItemAction(
  _prev: MenuActionResult | null,
  formData: FormData,
): Promise<MenuActionResult> {
  const user = await requireRole(["owner"]);
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing item id." };

  const parsed = itemSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    ingredientsText: formData.get("ingredients") || undefined,
    priceToman: formData.get("priceToman"),
    prepTimeMinutes: formData.get("prepTimeMinutes"),
    prepGroup: formData.get("prepGroup"),
    dailyQuantityDefault: formData.get("dailyQuantityDefault"),
    isActive: formData.get("isActive") === "on" ? true : false,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  // Tenant-scoped update: the WHERE clause rejects cross-tenant writes.
  const updated = await db
    .update(menuItems)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ingredients: parseIngredients(parsed.data.ingredientsText),
      priceToman: parsed.data.priceToman,
      prepTimeMinutes: parsed.data.prepTimeMinutes,
      prepGroup: parsed.data.prepGroup,
      dailyQuantityDefault: parsed.data.dailyQuantityDefault,
      isActive: parsed.data.isActive ?? true,
      updatedAt: new Date(),
    })
    .where(eq(menuItems.id, id))
    .returning({ id: menuItems.id, restaurantId: menuItems.restaurantId });

  if (!updated[0] || updated[0].restaurantId !== user.restaurantId) {
    return { ok: false, error: "Item not found." };
  }

  revalidatePath("/owner/menu");
  revalidatePath("/owner/availability");
  revalidatePath("/owner/dashboard");
  return { ok: true, menuItemId: id };
}

export async function toggleMenuItemActiveAction(
  menuItemId: string,
  nextActive: boolean,
): Promise<MenuActionResult> {
  const user = await requireRole(["owner"]);

  const [before] = await db
    .select({ restaurantId: menuItems.restaurantId })
    .from(menuItems)
    .where(eq(menuItems.id, menuItemId))
    .limit(1);
  if (!before || before.restaurantId !== user.restaurantId) {
    return { ok: false, error: "Item not found." };
  }

  await db
    .update(menuItems)
    .set({ isActive: nextActive, updatedAt: new Date() })
    .where(eq(menuItems.id, menuItemId));

  revalidatePath("/owner/menu");
  revalidatePath("/owner/dashboard");
  revalidatePath("/waiter/dashboard");
  return { ok: true, menuItemId };
}
