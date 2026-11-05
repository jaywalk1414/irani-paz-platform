'use client';

import { useState, useTransition } from 'react';
import {
  createMenuItemAction,
  updateMenuItemAction,
  toggleMenuItemActiveAction,
} from './actions';

export interface MenuRow {
  id: string;
  name: string;
  description: string | null;
  ingredientsText: string;
  priceToman: number;
  prepTimeMinutes: number;
  prepGroup: string;
  dailyQuantityDefault: number;
  isActive: boolean;
  todayConfigured: number | null;
  todayAvailable: number | null;
}

type DialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; row: MenuRow };

export function MenuTable({ rows }: { rows: MenuRow[] }) {
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
          {rows.length} item{rows.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={() => setDialog({ mode: 'create' })}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + New item
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Prep</th>
              <th className="px-3 py-2 text-right">Default</th>
              <th className="px-3 py-2 text-right">Today</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className={row.isActive ? '' : 'opacity-60'}>
                <td className="px-3 py-2">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-zinc-500">
                    {prepGroupLabel(row.prepGroup)}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.priceToman.toLocaleString('fa-IR')}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.prepTimeMinutes} min
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.dailyQuantityDefault}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.todayAvailable === null ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <span
                      className={
                        row.todayAvailable === 0
                          ? 'text-rose-600'
                          : row.todayAvailable <= 3
                            ? 'text-amber-600'
                            : ''
                      }
                    >
                      {row.todayAvailable}
                      <span className="text-xs text-zinc-400">
                        {' '}
                        / {row.todayConfigured}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      row.isActive
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                    }`}
                  >
                    {row.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <RowActions
                    row={row}
                    onEdit={() => setDialog({ mode: 'edit', row })}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                  No items yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog.mode !== 'closed' && (
        <MenuItemDialog
          mode={dialog.mode}
          row={dialog.mode === 'edit' ? dialog.row : undefined}
          onClose={() => setDialog({ mode: 'closed' })}
        />
      )}
    </>
  );
}

function RowActions({ row, onEdit }: { row: MenuRow; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      const result = await toggleMenuItemActiveAction(row.id, !row.isActive);
      if (!result.ok) setError(result.error ?? 'Failed.');
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
      <button
        onClick={onEdit}
        className="rounded border px-2 py-1 text-xs hover:bg-zinc-50"
      >
        Edit
      </button>
      <button
        onClick={toggle}
        disabled={pending}
        className="rounded border px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        {row.isActive ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );
}

function MenuItemDialog({
  mode,
  row,
  onClose,
}: {
  mode: 'create' | 'edit';
  row?: MenuRow;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      const action = mode === 'create' ? createMenuItemAction : updateMenuItemAction;
      const result = await action(null, formData);
      if (result.ok) onClose();
      else setError(result.error ?? 'Failed.');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12">
      <form
        action={handleSubmit}
        className="w-full max-w-lg space-y-3 rounded-lg bg-white p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {mode === 'create' ? 'New menu item' : 'Edit menu item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-800"
          >
            ✕
          </button>
        </div>

        {row && <input type="hidden" name="id" value={row.id} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            Name
            <input
              name="name"
              defaultValue={row?.name ?? ''}
              required
              maxLength={120}
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            Description
            <textarea
              name="description"
              defaultValue={row?.description ?? ''}
              rows={2}
              maxLength={1000}
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            Ingredients (comma-separated)
            <input
              name="ingredients"
              defaultValue={row?.ingredientsText ?? ''}
              placeholder="beef, saffron, rice"
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-sm">
            Price (toman)
            <input
              name="priceToman"
              type="number"
              min={0}
              step={1000}
              defaultValue={row?.priceToman ?? 0}
              required
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-sm">
            Prep time (minutes)
            <input
              name="prepTimeMinutes"
              type="number"
              min={1}
              defaultValue={row?.prepTimeMinutes ?? 10}
              required
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-sm">
            Prep group
            <select
              name="prepGroup"
              defaultValue={row?.prepGroup ?? 'other'}
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            >
              <option value="grill">Grill</option>
              <option value="fryer">Fryer</option>
              <option value="stew_rice">Stew &amp; Rice</option>
              <option value="cold">Cold</option>
              <option value="beverage">Beverage</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block text-sm">
            Default daily qty
            <input
              name="dailyQuantityDefault"
              type="number"
              min={0}
              defaultValue={row?.dailyQuantityDefault ?? 20}
              required
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={row?.isActive ?? true}
          />
          Active (available for ordering)
        </label>

        {error && (
          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function prepGroupLabel(g: string): string {
  const map: Record<string, string> = {
    grill: 'Grill',
    fryer: 'Fryer',
    stew_rice: 'Stew & Rice',
    cold: 'Cold',
    beverage: 'Beverage',
    other: 'Other',
  };
  return map[g] ?? g;
}