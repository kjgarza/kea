/**
 * Add-to-home-screen support. Android/Chromium fires `beforeinstallprompt`
 * early in the page's life, so `listenForInstallPrompt()` runs from the root
 * layout and keeps the event until the prompt UI asks for it. iOS Safari has
 * no install API, so the UI shows instructions there instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let listening = false;
const listeners = new Set<() => void>();

export function listenForInstallPrompt(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Show the browser's install dialog (Android). Returns true if accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  listeners.forEach((l) => l());
  try {
    await event.prompt();
    return (await event.userChoice).outcome === "accepted";
  } catch {
    return false;
  }
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as Mac; touch points tell them apart.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Running as an installed app (home-screen icon). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches)
  );
}
