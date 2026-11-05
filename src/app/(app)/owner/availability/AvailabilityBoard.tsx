'use client';

import { useActionState, useState } from 'react';
import type { MenuItemAvailability } from '@/lib/services/availability.service';
import {
  adjustAvailabilityAction,
  type AdjustAvailabilityState,
} from './actions';

export function AvailabilityBoard({ items }: { items: MenuItemAvailability[] }) {
  const [filter, setFilter] = useState('');

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter items…"
        className="w-full rounded border bg-white px-3 py-2 text-sm"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <ItemCard key={item.menuItemId} item={item} />
        ))}
        {filtered.length === 0 && (
          <div className="rounded border border-dashed p-6 text-center text-sm text-zinc-500 sm:col-span-2 lg:col-span-3">
            No matching items.
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: MenuItemAvailability }) {
  const [state, formAction, pending] = useActionState<
    AdjustAvailabilityState,
    FormData
  >(adjustAvailabilityAction, null);

  const [expanded, setExpanded] = useState(false);

  const available = state?.ok ? state.availableQuantity : item.availableQuantity;
  const configured = state?.ok ? state.configuredQuantity : item.configuredQuantity;

  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{item.name}</div>
          <div className="text-xs text-zinc-500">
            {item.priceToman.toLocaleString('fa-IR')} toman · {item.prepTimeMinutes} min
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${
            available === 0
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : available <= 3
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {available} left
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-zinc-50 py-1">
          <div className="font-semibold tabular-nums">{configured}</div>
          <div className="text-[10px] uppercase text-zinc-500">Configured</div>
        </div>
        <div className="rounded bg-zinc-50 py-1">
          <div className="font-semibold tabular-nums">{item.reservedQuantity}</div>
          <div className="text-[10px] uppercase text-zinc-500">Reserved</div>
        </div>
        <div className="rounded bg-zinc-50 py-1">
          <div className="font-semibold tabular-nums">{available}</div>
          <div className="text-[10px] uppercase text-zinc-500">Available</div>
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 w-full rounded border px-2 py-1.5 text-xs hover:bg-zinc-50"
      >
        {expanded ? 'Cancel' : 'Adjust quantity'}
      </button>

      {expanded && (
        <form action={formAction} className="mt-2 space-y-2 border-t pt-2">
          <input type="hidden" name="menuItemId" value={item.menuItemId} />

          <label className="block text-xs">
            Change (+ increase / − decrease)
            <input
              name="deltaConfigured"
              type="number"
              step={1}
              placeholder="e.g. -3"
              required
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-xs">
            Reason (optional)
            <input
              name="reason"
              type="text"
              maxLength={500}
              placeholder="e.g. grill delay"
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>

          {state && !state.ok && (
            <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
              {state.error}
            </p>
          )}
          {state && state.ok && (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
              Updated: {state.availableQuantity} available, {state.configuredQuantity} configured.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-black px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Applying…' : 'Apply adjustment'}
          </button>
        </form>
      )}
    </div>
  );
}