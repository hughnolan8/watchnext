"use client";

import Link from "next/link";
import { useState } from "react";
import { load } from "@/lib/storage";

const MESSAGES: Record<string, string> = {
  bad_email: "Enter a valid email address.",
  weak_password: "Use at least 8 characters for your password.",
  email_taken: "There's already an account with that email. Sign in instead.",
  bad_credentials: "That email and password don't match an account.",
};

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const signup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // New accounts start in the region this browser last used, if any
        body: JSON.stringify(signup ? { name, email, password, region: load("region", undefined) } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(MESSAGES[data.error] ?? "Something went wrong. Try again.");
        return;
      }
      // New accounts go straight to picking their services
      window.location.assign(signup ? "/account?welcome=1" : safeNext(next));
    } catch {
      setError("Network error. Is the server running?");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 outline-none placeholder:text-muted focus:border-accent";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 font-display text-3xl font-bold tracking-tight">
        Watch<span className="text-accent">Next</span>
      </Link>
      <h1 className="font-display text-2xl font-semibold">{signup ? "Create your account" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-muted">
        {signup
          ? "Your account remembers which streaming services you pay for. You can change them any time."
          : "Welcome back."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {signup && (
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted">Name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={input} />
          </label>
        )}
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={input}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">Password{signup && " (8+ characters)"}</span>
          <input
            type="password"
            required
            minLength={signup ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
            className={input}
          />
        </label>

        {error && <p className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-accent px-6 py-3 font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {signup ? "Already have an account? " : "New to WatchNext? "}
        <Link href={signup ? "/login" : "/signup"} className="text-accent hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}

// Only follow same-site paths after sign-in
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
