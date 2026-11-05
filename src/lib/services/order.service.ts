import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, type DB } from '@/lib/db/client';
import {
  menuItems,
  orderItems,
  orders,
  orderStatusHistory,
  orderSubmissions,
  tables,
} from '@/lib/db/schema';
import { reserveQuantity, releaseQuantity, getBusinessContext } from './availability.service';
import { computeOrderEstimate } from './estimate.service';
import { OrderError } from './errors';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

const ACTIVE_ORDER_STATUSES = ['confirmed', 'preparing'] as const;

// ---------------------------------------------------------------------------
// Service context (obtained from requireTenant() at the entry point)
// ---------------------------------------------------------------------------

export interface ServiceContext {
  restaurantId: string;
  branchId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export interface OrderLineInput {
  menuItemId: string;
  quantity: number;
  specialInstructions?: string | null;
}

export interface SubmitOrderInput {
  idempotencyKey: string;
  tableId: string;
  items: OrderLineInput[];
}

export interface OrderItemView {
  id: string;
  menuItemId: string;
  name: string;
  unitPriceToman: number;
  quantity: number;
  specialInstructions: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'cancelled';
  prepGroup: string;
  prepTimeMinutes: number;
  startedAt: Date | null;
  readyAt: Date | null;
}

export interface OrderView {
  id: string;
  tableId: string;
  tableLabel: string;
  status: 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
  items: OrderItemView[];
  totalToman: number;
  estimatedReadyAt: Date | null;
  confirmedAt: Date;
  readyAt: Date | null;
  servedAt: Date | null;
  cancelledAt: Date | null;
}

export interface SubmitOrderResult {
  order: OrderView;
  wasIdempotentReplay: boolean;
  wasAppend: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadOrderView(tx: Tx | DB, orderId: string): Promise<OrderView | null> {
  const [order] = await tx
    .select({
      id: orders.id,
      tableId: orders.tableId,
      tableLabel: tables.label,
      status: orders.status,
      estimatedReadyAt: orders.estimatedReadyAt,
      confirmedAt: orders.confirmedAt,
      readyAt: orders.readyAt,
      servedAt: orders.servedAt,
      cancelledAt: orders.cancelledAt,
    })
    .from(orders)
    .innerJoin(tables, eq(tables.id, orders.tableId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return null;

  const items = await tx
    .select({
      id: orderItems.id,
      menuItemId: orderItems.menuItemId,
      name: orderItems.nameSnapshot,
      unitPriceToman: orderItems.unitPriceTomanSnapshot,
      quantity: orderItems.quantity,
      specialInstructions: orderItems.specialInstructions,
      status: orderItems.status,
      prepGroup: orderItems.prepGroupSnapshot,
      prepTimeMinutes: orderItems.prepTimeMinutesSnapshot,
      startedAt: orderItems.startedAt,
      readyAt: orderItems.readyAt,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.createdAt);

  const totalToman = items
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => sum + i.unitPriceToman * i.quantity, 0);

  return { ...order, items, totalToman };
}

/** Recompute the estimated_ready_at from the current item state. */
async function recomputeOrderEstimate(
  tx: Tx,
  orderId: string,
  now: Date,
): Promise<void> {
  const items = await tx
    .select({
      prepGroup: orderItems.prepGroupSnapshot,
      prepTimeMinutes: orderItems.prepTimeMinutesSnapshot,
      status: orderItems.status,
      startedAt: orderItems.startedAt,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const estimate = computeOrderEstimate(items, now);

  await tx
    .update(orders)
    .set({ estimatedReadyAt: estimate, updatedAt: now })
    .where(eq(orders.id, orderId));
}

/**
 * Recompute the order-level status from item statuses.
 *
 *   all cancelled      → cancelled
 *   all non-cancelled ready → ready
 *   any preparing or ready  → preparing
 *   otherwise          → confirmed
 *
 * Never moves an order out of served/cancelled (terminal states).
 */
async function recomputeOrderStatus(
  tx: Tx,
  orderId: string,
  now: Date,
): Promise<void> {
  const [order] = await tx
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return;
  if (order.status === 'served' || order.status === 'cancelled') return;

  const items = await tx
    .select({ status: orderItems.status })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const active = items.filter((i) => i.status !== 'cancelled');
  if (active.length === 0) {
    await tx
      .update(orders)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(eq(orders.id, orderId));
    return;
  }

  const nextStatus = active.every((i) => i.status === 'ready')
    ? 'ready'
    : active.some((i) => i.status === 'preparing' || i.status === 'ready')
      ? 'preparing'
      : 'confirmed';

  if (nextStatus === order.status) return;

  await tx
    .update(orders)
    .set({
      status: nextStatus,
      readyAt: nextStatus === 'ready' ? now : null,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));
}

async function recordStatusChange(
  tx: Tx,
  orderId: string,
  from: OrderView['status'] | null,
  to: OrderView['status'],
  userId: string,
  at: Date,
): Promise<void> {
  await tx.insert(orderStatusHistory).values({
    orderId,
    fromStatus: from,
    toStatus: to,
    changedByUserId: userId,
    createdAt: at,
  });
}

// ---------------------------------------------------------------------------
// Submit order (create or append) — the core transactional entry point
// ---------------------------------------------------------------------------

/**
 * Submit an order for a table.
 *
 * - Idempotent on (restaurantId, idempotencyKey). Retries return the current
 *   state of the resulting order; nothing is applied twice.
 * - If the table already has an active order (confirmed/preparing), items are
 *   appended to it (no duplicate table order).
 * - Otherwise a new order is created and the table is marked occupied.
 * - Each line reserves its quantity atomically inside the same transaction.
 *   If any line is unavailable, the whole submission rolls back.
 */
export async function submitOrder(
  ctx: ServiceContext,
  input: SubmitOrderInput,
): Promise<SubmitOrderResult> {
  if (input.items.length === 0) {
    throw new OrderError('EMPTY_ORDER', 'Order must contain at least one item.');
  }
  for (const line of input.items) {
    if (line.quantity <= 0) {
      throw new OrderError('INVALID_QUANTITY', 'Quantity must be positive.');
    }
  }

  // Business date computed OUTSIDE the transaction to keep the pool clean.
  const businessCtx = await getBusinessContext(ctx.restaurantId);

  return db.transaction(async (tx) => {
    // 1. Idempotency check
    const [existing] = await tx
      .select({ orderId: orderSubmissions.orderId })
      .from(orderSubmissions)
      .where(
        and(
          eq(orderSubmissions.restaurantId, ctx.restaurantId),
          eq(orderSubmissions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    if (existing) {
      const view = await loadOrderView(tx, existing.orderId);
      if (!view) throw new OrderError('ORDER_NOT_FOUND');
      return { order: view, wasIdempotentReplay: true, wasAppend: false };
    }

    // 2. Verify table belongs to tenant
    const [table] = await tx
      .select({ id: tables.id })
      .from(tables)
      .where(
        and(
          eq(tables.id, input.tableId),
          eq(tables.restaurantId, ctx.restaurantId),
        ),
      )
      .limit(1);
    if (!table) throw new OrderError('TABLE_NOT_FOUND');

    // 3. Find active order for table, or create a new one
    const [active] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(
        and(
          eq(orders.tableId, input.tableId),
          eq(orders.restaurantId, ctx.restaurantId),
          inArray(orders.status, [...ACTIVE_ORDER_STATUSES]),
        ),
      )
      .limit(1);

    const now = new Date();
    let orderId: string;
    let wasAppend = false;

    if (active) {
      orderId = active.id;
      wasAppend = true;
    } else {
      const [created] = await tx
        .insert(orders)
        .values({
          restaurantId: ctx.restaurantId,
          branchId: ctx.branchId,
          tableId: input.tableId,
          createdByUserId: ctx.userId,
          status: 'confirmed',
          idempotencyKey: input.idempotencyKey,
          confirmedAt: now,
        })
        .returning({ id: orders.id });
      orderId = created.id;

      await tx
        .update(tables)
        .set({ status: 'occupied' })
        .where(eq(tables.id, input.tableId));

      await recordStatusChange(tx, orderId, null, 'confirmed', ctx.userId, now);
    }

    // 4. Reserve, snapshot, insert each line
    for (const line of input.items) {
      const [item] = await tx
        .select()
        .from(menuItems)
        .where(
          and(
            eq(menuItems.id, line.menuItemId),
            eq(menuItems.restaurantId, ctx.restaurantId),
            eq(menuItems.isActive, true),
          ),
        )
        .limit(1);

      if (!item) {
        throw new OrderError('MENU_ITEM_NOT_FOUND', `Item ${line.menuItemId} is unavailable.`);
      }

      // Atomic reservation — throws InsufficientAvailabilityError if unavailable.
      // Any throw here rolls back the entire transaction, including the order row.
      await reserveQuantity(tx, {
        restaurantId: ctx.restaurantId,
        menuItemId: line.menuItemId,
        businessDate: businessCtx.businessDate,
        quantity: line.quantity,
      });

      await tx.insert(orderItems).values({
        orderId,
        restaurantId: ctx.restaurantId,
        menuItemId: item.id,
        nameSnapshot: item.name,
        unitPriceTomanSnapshot: item.priceToman,
        descriptionSnapshot: item.description,
        prepTimeMinutesSnapshot: item.prepTimeMinutes,
        prepGroupSnapshot: item.prepGroup,
        quantity: line.quantity,
        specialInstructions: line.specialInstructions ?? null,
        status: 'pending',
      });
    }

    // 5. Recompute estimate and (if needed) order status
    await recomputeOrderEstimate(tx, orderId, now);
    await recomputeOrderStatus(tx, orderId, now);

    // 6. Record submission for idempotency
    await tx.insert(orderSubmissions).values({
      restaurantId: ctx.restaurantId,
      idempotencyKey: input.idempotencyKey,
      orderId,
    });

    const view = await loadOrderView(tx, orderId);
    if (!view) throw new OrderError('ORDER_NOT_FOUND');

    return { order: view, wasIdempotentReplay: false, wasAppend };
  });
}

// ---------------------------------------------------------------------------
// Kitchen: advance item status
// ---------------------------------------------------------------------------

export async function markItemPreparing(
  ctx: ServiceContext,
  orderItemId: string,
): Promise<OrderView> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: orderItems.id, orderId: orderItems.orderId, status: orderItems.status })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.id, orderItemId),
          eq(orders.restaurantId, ctx.restaurantId),
        ),
      )
      .limit(1);
    if (!item) throw new OrderError('ORDER_ITEM_NOT_FOUND');
    if (item.status !== 'pending') {
      throw new OrderError('INVALID_TRANSITION', `Cannot start a ${item.status} item.`);
    }

    const now = new Date();
    await tx
      .update(orderItems)
      .set({ status: 'preparing', startedAt: now })
      .where(eq(orderItems.id, orderItemId));

    await recomputeOrderStatus(tx, item.orderId, now);
    await recomputeOrderEstimate(tx, item.orderId, now);

    const view = await loadOrderView(tx, item.orderId);
    if (!view) throw new OrderError('ORDER_NOT_FOUND');
    return view;
  });
}

export async function markItemReady(
  ctx: ServiceContext,
  orderItemId: string,
): Promise<OrderView> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: orderItems.id, orderId: orderItems.orderId, status: orderItems.status })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.id, orderItemId),
          eq(orders.restaurantId, ctx.restaurantId),
        ),
      )
      .limit(1);
    if (!item) throw new OrderError('ORDER_ITEM_NOT_FOUND');
    if (item.status !== 'preparing' && item.status !== 'pending') {
      throw new OrderError('INVALID_TRANSITION', `Cannot mark a ${item.status} item ready.`);
    }

    const now = new Date();
    await tx
      .update(orderItems)
      .set({
        status: 'ready',
        startedAt: sql`COALESCE(${orderItems.startedAt}, ${now})`,
        readyAt: now,
      })
      .where(eq(orderItems.id, orderItemId));

    await recomputeOrderStatus(tx, item.orderId, now);
    await recomputeOrderEstimate(tx, item.orderId, now);

    const view = await loadOrderView(tx, item.orderId);
    if (!view) throw new OrderError('ORDER_NOT_FOUND');
    return view;
  });
}

export async function cancelItem(
  ctx: ServiceContext,
  orderItemId: string,
  reason: string | null,
): Promise<OrderView> {
  const businessCtx = await getBusinessContext(ctx.restaurantId);

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        menuItemId: orderItems.menuItemId,
        quantity: orderItems.quantity,
        status: orderItems.status,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.id, orderItemId),
          eq(orders.restaurantId, ctx.restaurantId),
        ),
      )
      .limit(1);
    if (!item) throw new OrderError('ORDER_ITEM_NOT_FOUND');
    if (item.status === 'ready' || item.status === 'cancelled') {
      throw new OrderError('INVALID_TRANSITION', `Cannot cancel a ${item.status} item.`);
    }

    const now = new Date();
    await tx
      .update(orderItems)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        specialInstructions: reason
          ? sql`COALESCE(${orderItems.specialInstructions} || E'\n', '') || ${'[cancelled] ' + reason}`
          : orderItems.specialInstructions,
      })
      .where(eq(orderItems.id, orderItemId));

    // Release the reservation so the portion becomes available again.
    await releaseQuantity(tx, {
      restaurantId: ctx.restaurantId,
      menuItemId: item.menuItemId,
      businessDate: businessCtx.businessDate,
      quantity: item.quantity,
    });

    await recomputeOrderStatus(tx, item.orderId, now);
    await recomputeOrderEstimate(tx, item.orderId, now);

    const view = await loadOrderView(tx, item.orderId);
    if (!view) throw new OrderError('ORDER_NOT_FOUND');
    return view;
  });
}

// ---------------------------------------------------------------------------
// Waiter: mark served (frees the table)
// ---------------------------------------------------------------------------

export async function markOrderServed(
  ctx: ServiceContext,
  orderId: string,
): Promise<OrderView> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, tableId: orders.tableId, status: orders.status })
      .from(orders)
      .where(
        and(eq(orders.id, orderId), eq(orders.restaurantId, ctx.restaurantId)),
      )
      .limit(1);
    if (!order) throw new OrderError('ORDER_NOT_FOUND');
    if (order.status !== 'ready') {
      throw new OrderError(
        'INVALID_TRANSITION',
        `Order must be ready before served (currently ${order.status}).`,
      );
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({ status: 'served', servedAt: now, updatedAt: now })
      .where(eq(orders.id, orderId));

    await recordStatusChange(tx, orderId, order.status, 'served', ctx.userId, now);

    await tx
      .update(tables)
      .set({ status: 'available' })
      .where(eq(tables.id, order.tableId));

    const view = await loadOrderView(tx, orderId);
    if (!view) throw new OrderError('ORDER_NOT_FOUND');
    return view;
  });
}

// ---------------------------------------------------------------------------
// Reads (for waiter and kitchen UIs)
// ---------------------------------------------------------------------------

export async function getActiveOrderForTable(
  restaurantId: string,
  tableId: string,
): Promise<OrderView | null> {
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.tableId, tableId),
        inArray(orders.status, [...ACTIVE_ORDER_STATUSES, 'ready']),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return order ? loadOrderView(db, order.id) : null;
}

export async function listKitchenOrders(
  restaurantId: string,
  branchId: string,
): Promise<OrderView[]> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.branchId, branchId),
        inArray(orders.status, ['confirmed', 'preparing']),
      ),
    )
    .orderBy(orders.confirmedAt);

  return (await Promise.all(rows.map((r) => loadOrderView(db, r.id)))).filter(
    (v): v is OrderView => v !== null,
  );
}