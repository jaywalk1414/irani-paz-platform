import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { restaurants, branches } from './restaurants';
import { userRoleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    // Nullable: owners are restaurant-wide; waiters/kitchen are branch-scoped.
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    role: userRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('users_restaurant_idx').on(t.restaurantId),
    index('users_branch_idx').on(t.branchId),
  ],
);