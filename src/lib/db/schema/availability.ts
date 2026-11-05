import {
  pgTable, uuid, integer, text, date, timestamp, index, unique,
} from 'drizzle-orm/pg-core';
import { restaurants } from './restaurants';
import { users } from './users';
import { menuItems } from './menu';

export const dailyAvailability = pgTable(
  'daily_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),

    businessDate: date('business_date').notNull(),

    // configuredQuantity is the STARTING stock for the day.
    // available = configuredQuantity - reservedQuantity (computed at read time).
    configuredQuantity: integer('configured_quantity').notNull(),
    reservedQuantity: integer('reserved_quantity').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('daily_availability_unique').on(t.menuItemId, t.businessDate),
    index('daily_availability_lookup_idx').on(t.restaurantId, t.businessDate),
  ],
);

export const availabilityAdjustments = pgTable(
  'availability_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    dailyAvailabilityId: uuid('daily_availability_id')
      .notNull()
      .references(() => dailyAvailability.id, { onDelete: 'cascade' }),
    adjustedByUserId: uuid('adjusted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    deltaConfigured: integer('delta_configured').notNull(),
    previousConfigured: integer('previous_configured').notNull(),
    newConfigured: integer('new_configured').notNull(),
    reason: text('reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('availability_adjustments_restaurant_idx').on(
      t.restaurantId,
      t.createdAt,
    ),
  ],
);