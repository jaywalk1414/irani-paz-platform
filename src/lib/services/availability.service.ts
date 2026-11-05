import { and, eq, sql } from 'drizzle-orm';
import { db, type DB } from '@/lib/db/client';
import {
  availabilityAdjustments,
  dailyAvailability,
  menuItems,
  restaurants,
} from '@/lib/db/schema';
import {
  getBusinessDate,
  parseCutoffHour,
} from '@/lib/business-day';
import {
  AvailabilityConflictError,
  ConfiguredBelowReservedError,
  InsufficientAvailabilityError,
} from './errors';

// Transaction handle type. Every mutating operation takes a `tx` so it can be
// composed inside the caller's transaction (e.g. order creation).
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type DbOrTx = DB | Tx;

// ---------------------------------------------------------------------------
// Read helper: resolve a restaurant's business context
// ---------------------------------------------------------------------------

export interface RestaurantBusinessContext {
  restaurantId: string;
  timezone: string;
  cutoffHour: number;
  businessDate: string;
}

/**
 * Resolve the current business date for a restaurant.
 * Callers should not compute this themselves — the cutoff lives in the DB.
 */
export async function getBusinessContext(
  restaurantId: string,
  now?: Date,
): Promise<RestaurantBusinessContext> {
  const [r] = await db
    .select({
      id: restaurants.id,
      timezone: restaurants.timezone,
      cutoff: restaurants.businessDayCutoff,
    })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);

  if (!r) throw new AvailabilityConflictError('Restaurant not found.');

  const cutoffHour = parseCutoffHour(r.cutoff);
  return {
    restaurantId: r.id,
    timezone: r.timezone,
    cutoffHour,
    businessDate: getBusinessDate(r.timezone, cutoffHour, now),
  };
}

// ---------------------------------------------------------------------------
// Lazy initialization
// ---------------------------------------------------------------------------

/**
 * Ensure today's availability rows exist for every active menu item.
 *
 * Idempotent: `ON CONFLICT (menu_item_id, business_date) DO NOTHING` makes
 * concurrent calls safe. This is how the business-day reset happens on a
 * serverless runtime — no per-restaurant cron required.
 */
export async function ensureDayInitialized(
  tx: DbOrTx,
  restaurantId: string,
  businessDate: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO daily_availability
      (restaurant_id, menu_item_id, business_date, configured_quantity, reserved_quantity)
    SELECT
      mi.restaurant_id,
      mi.id,
      ${businessDate}::date,
      mi.daily_quantity_default,
      0
    FROM menu_items mi
    WHERE mi.restaurant_id = ${restaurantId}
      AND mi.is_active = true
    ON CONFLICT (menu_item_id, business_date) DO NOTHING
  `);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface MenuItemAvailability {
  menuItemId: string;
  name: string;
  description: string | null;
  priceToman: number;
  prepTimeMinutes: number;
  prepGroup: string;
  isActive: boolean;
  configuredQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

/**
 * Full menu with today's availability — used by the waiter ordering flow
 * and the owner dashboard. Initializes the day if needed.
 */
export async function listMenuWithAvailability(
  restaurantId: string,
  businessDate: string,
): Promise<MenuItemAvailability[]> {
  await ensureDayInitialized(db, restaurantId, businessDate);

  const rows = await db
    .select({
      menuItemId: menuItems.id,
      name: menuItems.name,
      description: menuItems.description,
      priceToman: menuItems.priceToman,
      prepTimeMinutes: menuItems.prepTimeMinutes,
      prepGroup: menuItems.prepGroup,
      isActive: menuItems.isActive,
      configuredQuantity: dailyAvailability.configuredQuantity,
      reservedQuantity: dailyAvailability.reservedQuantity,
    })
    .from(menuItems)
    .innerJoin(
      dailyAvailability,
      and(
        eq(dailyAvailability.menuItemId, menuItems.id),
        eq(dailyAvailability.businessDate, businessDate),
      ),
    )
    .where(eq(menuItems.restaurantId, restaurantId));

  return rows.map((r) => ({
    ...r,
    availableQuantity: Math.max(
      0,
      r.configuredQuantity - r.reservedQuantity,
    ),
  }));
}

/** Single-item read — useful for guards before showing a confirm button. */
export async function getItemAvailability(
  restaurantId: string,
  menuItemId: string,
  businessDate: string,
): Promise<MenuItemAvailability | null> {
  const all = await listMenuWithAvailability(restaurantId, businessDate);
  return all.find((m) => m.menuItemId === menuItemId) ?? null;
}

// ---------------------------------------------------------------------------
// Reservation / release (transactional)
// ---------------------------------------------------------------------------

export interface ReservationInput {
  restaurantId: string;
  menuItemId: string;
  businessDate: string;
  quantity: number;
}

/**
 * Atomically reserve `quantity` portions of a menu item for a business date.
 *
 * MUST be called inside a transaction that also creates the order, so that
 * either both succeed or both roll back.
 *
 * The single conditional UPDATE is the source of truth for the concurrency
 * guarantee described in DECISIONS.md §6. If it affects 0 rows, the caller's
 * transaction must be rolled back.
 */
export async function reserveQuantity(
  tx: Tx,
  input: ReservationInput,
): Promise<void> {
  if (input.quantity <= 0) {
    throw new AvailabilityConflictError('Quantity must be positive.');
  }

  // Lazy-init inside the transaction so the row always exists.
  await ensureDayInitialized(tx, input.restaurantId, input.businessDate);

  const result = await tx.execute(sql`
    UPDATE daily_availability
    SET
      reserved_quantity = reserved_quantity + ${input.quantity},
      updated_at = now()
    WHERE restaurant_id = ${input.restaurantId}
      AND menu_item_id = ${input.menuItemId}
      AND business_date = ${input.businessDate}::date
      AND configured_quantity - reserved_quantity >= ${input.quantity}
    RETURNING id, configured_quantity, reserved_quantity
  `);

  const rows = result.rows as Array<{
    id: string;
    configured_quantity: number;
    reserved_quantity: number;
  }>;

  if (rows.length === 0) {
    // Re-read to report *why*: is the item missing, or just out of stock?
    const [current] = await tx
      .select({
        configured: dailyAvailability.configuredQuantity,
        reserved: dailyAvailability.reservedQuantity,
      })
      .from(dailyAvailability)
      .where(
        and(
          eq(dailyAvailability.menuItemId, input.menuItemId),
          eq(dailyAvailability.businessDate, input.businessDate),
        ),
      )
      .limit(1);

    const available = current
      ? Math.max(0, current.configured - current.reserved)
      : 0;
    throw new InsufficientAvailabilityError(
      input.menuItemId,
      input.quantity,
      available,
    );
  }
}

/**
 * Release previously reserved portions (e.g. when an order item is cancelled).
 * Clamped at 0 so a double-release cannot push reserved negative.
 */
export async function releaseQuantity(
  tx: Tx,
  input: ReservationInput,
): Promise<void> {
  if (input.quantity <= 0) return;

  await tx
    .update(dailyAvailability)
    .set({
      reservedQuantity: sql`GREATEST(${dailyAvailability.reservedQuantity} - ${input.quantity}, 0)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dailyAvailability.restaurantId, input.restaurantId),
        eq(dailyAvailability.menuItemId, input.menuItemId),
        eq(dailyAvailability.businessDate, input.businessDate),
      ),
    );
}

// ---------------------------------------------------------------------------
// Owner adjustment (with audit)
// ---------------------------------------------------------------------------

export interface AdjustQuantityInput {
  restaurantId: string;
  menuItemId: string;
  businessDate: string;
  /** Positive to increase available stock, negative to decrease. */
  deltaConfigured: number;
  reason?: string | null;
  adjustedByUserId: string;
}

/**
 * Adjust the configured quantity for a business day and record the change.
 *
 * Invariants enforced here:
 *   - the daily_availability row exists (lazy init if not),
 *   - new configured >= already-reserved quantity,
 *   - the adjustment is auditable (one row per call).
 *
 * Runs in its own transaction because the owner dashboard calls it directly
 * (not as part of order creation).
 */
export async function adjustQuantity(input: AdjustQuantityInput): Promise<{
  configuredQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}> {
  if (input.deltaConfigured === 0) {
    throw new AvailabilityConflictError('Adjustment delta cannot be zero.');
  }

  return db.transaction(async (tx) => {
    await ensureDayInitialized(tx, input.restaurantId, input.businessDate);

    // Lock the row so concurrent adjustments serialize.
    const [row] = await tx
      .select({
        id: dailyAvailability.id,
        configured: dailyAvailability.configuredQuantity,
        reserved: dailyAvailability.reservedQuantity,
      })
      .from(dailyAvailability)
      .where(
        and(
          eq(dailyAvailability.restaurantId, input.restaurantId),
          eq(dailyAvailability.menuItemId, input.menuItemId),
          eq(dailyAvailability.businessDate, input.businessDate),
        ),
      )
      .for('update');

    if (!row) {
      throw new AvailabilityConflictError('Availability row not found.');
    }

    const nextConfigured = row.configured + input.deltaConfigured;

    if (nextConfigured < 0) {
      throw new AvailabilityConflictError(
        'Configured quantity cannot be negative.',
      );
    }
    if (nextConfigured < row.reserved) {
      throw new ConfiguredBelowReservedError(nextConfigured, row.reserved);
    }

    await tx
      .update(dailyAvailability)
      .set({
        configuredQuantity: nextConfigured,
        updatedAt: new Date(),
      })
      .where(eq(dailyAvailability.id, row.id));

    await tx.insert(availabilityAdjustments).values({
      restaurantId: input.restaurantId,
      dailyAvailabilityId: row.id,
      adjustedByUserId: input.adjustedByUserId,
      deltaConfigured: input.deltaConfigured,
      previousConfigured: row.configured,
      newConfigured: nextConfigured,
      reason: input.reason ?? null,
    });

    return {
      configuredQuantity: nextConfigured,
      reservedQuantity: row.reserved,
      availableQuantity: Math.max(0, nextConfigured - row.reserved),
    };
  });
}

// ---------------------------------------------------------------------------
// Adjustment history (owner audit view)
// ---------------------------------------------------------------------------

export interface AdjustmentHistoryEntry {
  id: string;
  createdAt: Date;
  menuItemName: string;
  adjustedByName: string;
  deltaConfigured: number;
  previousConfigured: number;
  newConfigured: number;
  reason: string | null;
}

export async function listRecentAdjustments(
  restaurantId: string,
  limit = 50,
): Promise<AdjustmentHistoryEntry[]> {
  // Owner dashboard view — no need to join users here; caller can enrich.
  const rows = await db
    .select({
      id: availabilityAdjustments.id,
      createdAt: availabilityAdjustments.createdAt,
      deltaConfigured: availabilityAdjustments.deltaConfigured,
      previousConfigured: availabilityAdjustments.previousConfigured,
      newConfigured: availabilityAdjustments.newConfigured,
      reason: availabilityAdjustments.reason,
      menuItemName: menuItems.name,
      adjustedByName: sql<string>`''`, // filled below if needed
    })
    .from(availabilityAdjustments)
    .innerJoin(
      dailyAvailability,
      eq(dailyAvailability.id, availabilityAdjustments.dailyAvailabilityId),
    )
    .innerJoin(menuItems, eq(menuItems.id, dailyAvailability.menuItemId))
    .where(eq(availabilityAdjustments.restaurantId, restaurantId))
    .orderBy(sql`${availabilityAdjustments.createdAt} DESC`)
    .limit(limit);

  return rows;
}