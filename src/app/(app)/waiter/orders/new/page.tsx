import { requireRole } from '@/lib/auth/require';
import {
  getBusinessContext,
  listMenuWithAvailability,
} from '@/lib/services/availability.service';
import { getActiveOrderForTable } from '@/lib/services/order.service';
import { db } from '@/lib/db/client';
import { tables } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { OrderFlow } from './OrderFlow';


export default async function NewOrderPage(props: {
  searchParams: Promise<{ tableId?: string }>;
}) {
  const params = await props.searchParams;
  const user = await requireRole(['waiter']);

  const businessCtx = await getBusinessContext(user.restaurantId);
  const menu = await listMenuWithAvailability(user.restaurantId, businessCtx.businessDate);

  const allTables = await db
    .select({
      id: tables.id,
      label: tables.label,
      seats: tables.seats,
      status: tables.status,
    })
    .from(tables)
    .where(
      and(eq(tables.restaurantId, user.restaurantId), eq(tables.branchId, user.branchId!)),
    )
    .orderBy(tables.label);

  const initialTableId = params.tableId ?? null;
  const existingOrder = initialTableId
    ? await getActiveOrderForTable(user.restaurantId, initialTableId)
    : null;

  return (
    <OrderFlow
      menu={menu}
      tables={allTables}
      initialTableId={initialTableId}
      initialExistingOrder={existingOrder}
    />
  );
}