"use client";

import Link from "next/link";
import type { Account } from "@/lib/types";

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.assign("/login");
}

/** Header links for the signed-in user. */
export function AccountMenu({ user, current }: { user: Account; current?: "account" }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-48 truncate text-muted sm:inline" title={user.email}>
        {user.name || user.email}
      </span>
      {current !== "account" && (
        <Link
          href="/account"
          className="rounded-full border border-line bg-surface-2 px-3 py-1.5 hover:border-fg/30"
        >
          Account
        </Link>
      )}
      <button type="button" onClick={signOut} className="text-muted hover:text-fg">
        Sign out
      </button>
    </div>
  );
}
