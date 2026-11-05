import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['owner', 'waiter', 'kitchen']);

export const tableStatusEnum = pgEnum('table_status', [
  'available',
  'occupied',
  'reserved',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'confirmed',
  'preparing',
  'ready',
  'served',
  'cancelled',
]);

export const orderItemStatusEnum = pgEnum('order_item_status', [
  'pending',
  'preparing',
  'ready',
  'cancelled',
]);

export const prepGroupEnum = pgEnum('prep_group', [
  'grill',
  'fryer',
  'stew_rice',
  'cold',
  'beverage',
  'other',
]);