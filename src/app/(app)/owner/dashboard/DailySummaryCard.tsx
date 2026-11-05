'use client';

import { useState, useTransition } from 'react';
import { generateSummaryAction } from './actions';

export function DailySummaryCard({
  initialSummary,
  businessDate,
}: {
  initialSummary: { content: string; model: string } | null;
  businessDate: string;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    start(async () => {
      const result = await generateSummaryAction();
      if (result.ok) setSummary({ content: result.content, model: result.model });
      else setError(result.error);
    });
  }

  return (
    <section className="rounded-lg border bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-[10px] font-bold text-white">
            AI
          </span>
          Daily service summary
        </h2>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {summary && (
            <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px]">
              {summary.model}
            </span>
          )}
          <button
            onClick={generate}
            disabled={pending}
            className="rounded border bg-white px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50"
          >
            {pending ? 'Generating…' : summary ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {summary ? (
        <p className="text-sm leading-relaxed text-zinc-700">{summary.content}</p>
      ) : (
        <p className="text-sm text-zinc-500">
          No summary for {businessDate} yet. Generate one to get an overview of
          today&rsquo;s orders, top sellers, and busy windows.
        </p>
      )}

      {error && (
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
          {error}
        </p>
      )}

      <p className="mt-2 text-[11px] text-zinc-400">
        Informational only — never changes orders, prices, or availability.
      </p>
    </section>
  );
}