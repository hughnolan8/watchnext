"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { load } from "@/lib/storage";
import type { Account, ProviderInfo } from "@/lib/types";
import { AccountMenu } from "./AccountMenu";
import { ServicePicker } from "./ServicePicker";

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function AccountSettings({
  user,
  initialSubscriptions,
  welcome,
  hasTmdb,
}: {
  user: Account;
  initialSubscriptions: ProviderInfo[];
  welcome: boolean;
  hasTmdb: boolean;
}) {
  const [name, setName] = useState(user.name);
  const [region, setRegion] = useState(user.region);
  const [regions, setRegions] = useState<{ code: string; name: string }[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(hasTmdb);
  // What's saved on the account for the region on screen, and what's ticked now
  const [saved, setSaved] = useState<number[]>(initialSubscriptions.map((s) => s.id));
  const [selected, setSelected] = useState<number[]>(initialSubscriptions.map((s) => s.id));
  const [savedProfile, setSavedProfile] = useState({ name: user.name, region: user.region });
  const [imported, setImported] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!hasTmdb) return;
    fetch("/api/regions")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRegions)
      .catch(() => {});
  }, [hasTmdb]);

  // Services that were picked in this browser before accounts existed carry over once
  useEffect(() => {
    if (initialSubscriptions.length) return;
    const local = load<Record<string, number[]>>("services", {})[user.region] ?? [];
    if (local.length) {
      setSelected(local);
      setImported(true);
    }
  }, [initialSubscriptions.length, user.region]);

  useEffect(() => {
    if (!hasTmdb) return;
    let cancelled = false;
    setProvidersLoading(true);
    fetch(`/api/providers?region=${region}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((list: ProviderInfo[]) => !cancelled && setProviders(list))
      .catch(() => !cancelled && setProviders([]))
      .finally(() => !cancelled && setProvidersLoading(false));
    return () => {
      cancelled = true;
    };
  }, [region, hasTmdb]);

  async function changeRegion(next: string) {
    setRegion(next);
    setImported(false);
    // Each region keeps its own list of subscriptions
    const res = await fetch(`/api/account?region=${next}`).catch(() => null);
    const data = res?.ok ? await res.json() : { subscriptions: [] };
    const ids = (data.subscriptions as ProviderInfo[]).map((s) => s.id);
    setSaved(ids);
    setSelected(ids);
  }

  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const dirty =
    !sameIds(selected, saved) || name.trim() !== savedProfile.name || region !== savedProfile.region;

  const chosen = useMemo(() => providers.filter((p) => selected.includes(p.id)), [providers, selected]);

  async function save() {
    setStatus("saving");
    try {
      const profile = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, region }),
      });
      const subs = await fetch("/api/account/subscriptions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ region, services: chosen }),
      });
      if (!profile.ok || !subs.ok) throw new Error();
      setSaved(chosen.map((p) => p.id));
      setSelected(chosen.map((p) => p.id));
      setSavedProfile({ name: name.trim(), region });
      setImported(false);
      setStatus("saved");
      if (welcome) window.location.assign("/");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <Link href="/" className="font-display text-3xl font-bold tracking-tight">
          Watch<span className="text-accent">Next</span>
        </Link>
        <AccountMenu user={user} current="account" />
      </header>

      <h1 className="font-display text-2xl font-semibold">{welcome ? "Welcome! Which services do you pay for?" : "Your account"}</h1>
      <p className="mt-1 text-sm text-muted">
        {welcome
          ? "Pick your streaming subscriptions so suggestions only include things you can watch. You can change these any time from Account."
          : "Your subscriptions are saved to your account, so they follow you to any device you sign in on."}
      </p>

      <div className="mt-6 space-y-6">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="mb-4 font-display text-xl font-semibold">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 outline-none focus:border-accent"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted">Email</span>
              <input
                value={user.email}
                disabled
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-muted"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted">Streaming region</span>
              <select
                value={region}
                onChange={(e) => changeRegion(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2"
              >
                {(regions.length ? regions : [{ code: region, name: region }]).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-xl font-semibold">Subscriptions</h2>
            <span className="text-sm text-muted">{selected.length} selected</span>
          </div>
          {imported && (
            <p className="mb-4 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
              We&apos;ve ticked the services you picked in this browser before. Save to add them to your account.
            </p>
          )}
          {hasTmdb ? (
            <ServicePicker
              providers={providers}
              selected={selected}
              onToggle={toggle}
              loading={providersLoading}
            />
          ) : (
            <p className="text-sm text-muted">
              Add <code>TMDB_API_KEY</code> to <code>.env.local</code> to load the list of streaming services.
            </p>
          )}
        </section>
      </div>

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-4 border-t border-line bg-bg/90 pt-4 pb-safe-4 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving" || (!dirty && !welcome) || providersLoading}
          className="rounded-full bg-accent px-7 py-3 font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "saving" ? "Saving…" : welcome ? "Save and get suggestions" : "Save changes"}
        </button>
        {status === "saved" && !dirty && <span className="text-sm text-good">Saved</span>}
        {status === "error" && <span className="text-sm text-bad">Couldn&apos;t save. Try again.</span>}
        {dirty && status !== "saving" && <span className="text-sm text-muted">Unsaved changes</span>}
        {welcome && (
          <Link href="/" className="text-sm text-muted hover:text-fg">
            Skip for now
          </Link>
        )}
      </div>
    </div>
  );
}
