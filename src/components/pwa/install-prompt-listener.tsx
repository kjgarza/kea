"use client";

import { useEffect } from "react";
import { listenForInstallPrompt } from "@/lib/pwa/install-prompt";

/** Mounted once in the root layout to catch Android's `beforeinstallprompt`. */
export function InstallPromptListener() {
  useEffect(() => {
    listenForInstallPrompt();
  }, []);
  return null;
}
