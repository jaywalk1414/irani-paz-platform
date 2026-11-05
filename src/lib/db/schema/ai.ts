import {
  pgTable, uuid, text, date, timestamp, unique,
} from 'drizzle-orm/pg-core';
import { restaurants } from './restaurants';

export const aiDailySummaries = pgTable(
  'ai_daily_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    businessDate: date('business_date').notNull(),
    content: text('content').notNull(),
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('ai_daily_summaries_unique').on(t.restaurantId, t.businessDate),
  ],
);