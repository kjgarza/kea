"use client";

import Link from "next/link";
import { GameGrid } from "@/components/home/game-grid";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { useLocale } from "@/lib/i18n";

export default function Home() {
  const { t } = useLocale();
  return (
    <main className="on-table feathers flex min-h-dvh flex-col">
      <header className="pt-safe shrink-0">
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <h1 className="display-type text-[3.75rem] leading-[0.86] whitespace-nowrap text-flash [overflow-wrap:normal] [--type-width:125%]">Kea</h1>
          <div className="flex items-center gap-1 pt-1">
            <Link href="/history" className="inline-flex h-11 items-center px-2 text-sm font-bold whitespace-nowrap">
              {t("history.link")}
            </Link>
            <Link href="/about" className="inline-flex h-11 items-center px-2 text-sm font-bold whitespace-nowrap">
              {t("home.about")}
            </Link>
            <LocaleSwitch />
          </div>
        </div>
        <p className="px-5 pt-2.5 pb-4 text-[1.0625rem] font-bold">{t("home.tagline")}</p>
      </header>

      <GameGrid />
    </main>
  );
}
