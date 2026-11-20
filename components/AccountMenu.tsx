"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Account } from "@/lib/types";

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  // Drop pages the service worker kept for offline use, so the next person on this device can't see them
  if ("caches" in window) {
    const keys = await caches.keys().catch(() => [] as string[]);
    await Promise.all(keys.filter((k) => k.startsWith("wn-pages-")).map((k) => caches.delete(k)));
  }
  window.location.assign("/login");
}

const itemClass =
  "block w-full px-3 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2";

/** Header menu for the signed-in user: their name opens Account and Sign out. */
export function AccountMenu({ user, current }: { user: Account; current?: "account" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const label = user.name || user.email;

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // Close on outside click or Escape while open
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Move focus into the menu when it opens
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative text-sm">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={user.email}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex max-w-[11rem] items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 hover:border-fg/30 sm:max-w-56"
      >
        <span className="truncate">{label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-2 w-44 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {current === "account" ? (
            <Link
              href="/account"
              role="menuitem"
              aria-current="page"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={`${itemClass} text-muted`}
            >
              Account
            </Link>
          ) : (
            <Link
              href="/account"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              Account
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={signOut}
            className={`${itemClass} text-muted hover:text-fg focus-visible:text-fg`}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
