import {
  pgTable, uuid, text, integer, timestamp, unique,
} from 'drizzle-orm/pg-core';
import { restaurants, branches } from './restaurants';
import { tableStatusEnum } from './enums';

export const tables = pgTable(
  'tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    label: text('label').notNull(), // e.g. "T1", "Patio 3"
    seats: integer('seats').notNull().default(2),
    status: tableStatusEnum('status').notNull().default('available'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tables_branch_label_unique').on(t.branchId, t.label),
  ],
);