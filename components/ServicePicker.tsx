"use client";

import { useState } from "react";
import type { ProviderInfo } from "@/lib/types";

const COLLAPSED = 18;

export function ServicePicker({
  providers,
  selected,
  onToggle,
  loading,
}: {
  providers: ProviderInfo[];
  selected: number[];
  onToggle: (id: number) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("");

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const matching = q ? providers.filter((p) => p.name.toLowerCase().includes(q)) : providers;
  // Always keep selected services visible, even when collapsed
  const shown =
    expanded || q
      ? matching
      : [
          ...matching.slice(0, COLLAPSED),
          ...matching.slice(COLLAPSED).filter((p) => selected.includes(p.id)),
        ];

  return (
    <div className="space-y-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter services…"
        className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent sm:w-64"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {shown.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition ${
                on
                  ? "border-accent bg-accent/15 text-fg"
                  : "border-line bg-surface-2 text-muted hover:border-fg/30 hover:text-fg"
              }`}
            >
              <img src={p.logo} alt="" className="h-8 w-8 shrink-0 rounded-lg" loading="lazy" />
              <span className="line-clamp-2 leading-tight">{p.name}</span>
            </button>
          );
        })}
      </div>
      {!q && providers.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-sm text-accent hover:underline"
        >
          {expanded ? "Show fewer" : `Show all ${providers.length} services`}
        </button>
      )}
    </div>
  );
}
