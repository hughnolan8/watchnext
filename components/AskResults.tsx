"use client";

import { useEffect, useRef, useState } from "react";
import type { AskResult, Suggestion } from "@/lib/types";
import { PosterCard, SparkIcon } from "./PosterRow";

export type AskState =
  | { q: string; status: "loading" }
  | { q: string; status: "done"; data: AskResult }
  | { q: string; status: "error"; message: string };

const ERRORS: Record<string, string> = {
  rate_limited: "You've asked a lot in a short time. Try again in a few minutes.",
  not_understood: "Couldn't work that one out. Try rewording it.",
  missing_key: "AI search isn't set up yet.",
  busy: "AI search is busy right now. Try again in a moment.",
};

/** Ask a question; resolves to the screen's next state. */
export async function runAsk(q: string, signal?: AbortSignal): Promise<AskState> {
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q }),
      signal,
    });
    if (res.ok) return { q, status: "done", data: (await res.json()) as AskResult };
    const err = await res.json().catch(() => ({}));
    return { q, status: "error", message: ERRORS[err?.error] ?? "AI search isn't working right now. Try again in a moment." };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { q, status: "error", message: "AI search isn't working right now. Try again in a moment." };
  }
}

/** Full-screen results for an "Ask WatchNext" question, with a box to ask again. */
export function AskResults({
  state,
  onAsk,
  onClose,
  onOpen,
  detailsOpen,
}: {
  state: AskState;
  onAsk: (q: string) => void;
  onClose: () => void;
  onOpen: (s: Suggestion) => void;
  detailsOpen: boolean;
}) {
  const [text, setText] = useState(state.q);
  const lastQ = useRef(state.q);
  if (lastQ.current !== state.q) {
    lastQ.current = state.q;
    setText(state.q);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !detailsOpen && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [detailsOpen, onClose]);

  const data = state.status === "done" ? state.data : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask WatchNext"
      className="fixed inset-0 z-[60] flex flex-col bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="border-b border-line px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <form
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-accent/70"
            onSubmit={(e) => {
              e.preventDefault();
              const q = text.trim();
              if (q.length >= 2) onAsk(q);
              (document.activeElement as HTMLElement | null)?.blur();
            }}
          >
            <SparkIcon className="h-4 w-4 shrink-0 text-accent" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              enterKeyHint="search"
              maxLength={300}
              placeholder="Ask for anything: “twisty British crime, 7+ on IMDb”"
              aria-label="Ask WatchNext"
              className="w-full bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
            />
          </form>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8">
        <div className="mx-auto max-w-6xl py-5">
          {state.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <SparkIcon className="h-4 w-4 animate-pulse text-accent" />
              Looking through this week&apos;s picks…
            </p>
          )}
          {state.status === "error" && <p className="text-sm text-bad">{state.message}</p>}

          {data && (
            <>
              {data.summary && <p className="font-display text-lg font-bold sm:text-xl">{data.summary}</p>}
              {data.chips.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What was searched for">
                  {data.chips.map((c) => (
                    <li key={c} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {(data.unsupported.length > 0 || data.notFound.length > 0) && (
                <div className="mt-3 space-y-1 text-xs text-muted">
                  {data.notFound.map((t) => (
                    <p key={t}>Couldn&apos;t find &ldquo;{t}&rdquo;, so it&apos;s not used as a match.</p>
                  ))}
                  {data.unsupported.map((u) => (
                    <p key={u}>{u}</p>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                {data.results.length
                  ? `${data.results.length} ${data.results.length === 1 ? "match" : "matches"} from this week's picks on your services`
                  : "Nothing in this week's picks on your services matches. Try asking more broadly."}
              </p>
              {data.results.length > 0 && (
                <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
                  {data.results.map((s) => (
                    <PosterCard key={s.key} s={s} onOpen={() => onOpen(s)} className="w-full" />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
