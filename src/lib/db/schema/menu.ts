import {
  pgTable, uuid, text, integer, boolean, timestamp, index,
} from 'drizzle-orm/pg-core';
import { restaurants } from './restaurants';
import { prepGroupEnum } from './enums';

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    description: text('description'),
    // Informational only — ingredient-level inventory is out of scope for MVP.
    ingredients: text('ingredients').array().notNull().default([]),

    priceToman: integer('price_toman').notNull(),
    prepTimeMinutes: integer('prep_time_minutes').notNull(),
    // Items in the same prep group share a station/resource and run sequentially.
    // Items in different groups can generally run in parallel.
    prepGroup: prepGroupEnum('prep_group').notNull().default('other'),

    // Default starting stock that seeds daily_availability each business day.
    dailyQuantityDefault: integer('daily_quantity_default').notNull().default(0),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('menu_items_restaurant_active_idx').on(t.restaurantId, t.isActive),
  ],
);