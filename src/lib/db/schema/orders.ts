import {
  pgTable, uuid, text, integer, timestamp, index, unique,
} from 'drizzle-orm/pg-core';
import { restaurants, branches } from './restaurants';
import { users } from './users';
import { menuItems } from './menu';
import { tables } from './tables';
import {
  orderStatusEnum, orderItemStatusEnum, prepGroupEnum,
} from './enums';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'restrict' }),

    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    status: orderStatusEnum('status').notNull().default('confirmed'),

    // Client-provided; protects against double-submits and retries.
    idempotencyKey: text('idempotency_key').notNull(),
    notes: text('notes'),

    // Recomputed whenever items are added or kitchen statuses change.
    estimatedReadyAt: timestamp('estimated_ready_at', { withTimezone: true }),

    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('orders_idempotency_unique').on(t.restaurantId, t.idempotencyKey),
    index('orders_table_idx').on(t.tableId, t.status),
    index('orders_restaurant_status_idx').on(t.restaurantId, t.status),
    index('orders_branch_status_idx').on(t.branchId, t.status),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),

    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'restrict' }),

    // ---- Snapshots at confirmation time (menu edits must not rewrite history) ----
    nameSnapshot: text('name_snapshot').notNull(),
    unitPriceTomanSnapshot: integer('unit_price_toman_snapshot').notNull(),
    descriptionSnapshot: text('description_snapshot'),
    prepTimeMinutesSnapshot: integer('prep_time_minutes_snapshot').notNull(),
    prepGroupSnapshot: prepGroupEnum('prep_group_snapshot').notNull(),

    // ---- Order data ----
    quantity: integer('quantity').notNull(),
    specialInstructions: text('special_instructions'),

    status: orderItemStatusEnum('status').notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_restaurant_status_idx').on(t.restaurantId, t.status),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_status_history_order_idx').on(t.orderId)],
);