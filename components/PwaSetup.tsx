"use client";

import { useEffect, useState } from "react";

/** Chrome/Edge's install event (not in the TS DOM types yet). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "wn_install_dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Registers the service worker (offline support, installability) and offers to
 * install the app: a one-tap button where the browser supports it (Chrome, Edge),
 * or the Share → Add to Home Screen steps on iPhone and iPad Safari.
 */
export function PwaSetup() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (isStandalone() || wasDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari has no install event; touch Macs report as iPad
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (ios && safari) setIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setPrompt(null);
    setIosHint(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  if (!prompt && !iosHint) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-sm shadow-2xl">
        <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <p className="flex-1 text-muted">
          {prompt ? (
            <>Install <span className="font-semibold text-fg">WatchNext</span> as an app.</>
          ) : (
            <>
              Add to your Home Screen: tap{" "}
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="inline h-4 w-4 -translate-y-px text-accent" aria-label="Share">
                <path d="M10 13V3M6.5 6.5L10 3l3.5 3.5M5 10H4v7h12v-7h-1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>{" "}
              then <span className="font-semibold text-fg">Add to Home Screen</span>.
            </>
          )}
        </p>
        {prompt && (
          <button type="button" onClick={install} className="rounded-full bg-accent px-4 py-2 font-semibold text-bg">
            Install
          </button>
        )}
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-full p-1.5 text-muted hover:text-fg">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
