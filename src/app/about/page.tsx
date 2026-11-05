import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Kea",
  description: "Why Kea was built and how it works.",
};

export default function AboutPage() {
  return (
    <main className="pt-safe flex min-h-dvh flex-col px-5 pb-safe-5">
      <div className="flex flex-1 flex-col">
        <Link
          href="/"
          aria-label="Back to games"
          className="-ml-2 mt-2 inline-flex size-11 items-center justify-center rounded-full active:bg-foreground/10"
        >
          <ArrowLeft className="size-6" />
        </Link>

        <h1 className="display-type mt-4 mb-8 text-[5rem] text-flash [--type-width:120%]">About</h1>

        {/* Prose content */}
        <div className="prose prose-lg prose-neutral max-w-none flex-1 prose-headings:font-extrabold">
          <h2>Why I built this</h2>
          <p>
            Kea was born out of a simple frustration: you&rsquo;re outdoors with
            friends, the sun is out, the vibe is perfect — and you want to play
            a card game. But you left your cards at home, the internet is patchy,
            and nobody wants to squint at a PDF.
          </p>
          <p>
            So I built Kea: a lightweight, offline-ready party game app that
            lives entirely on your phone. Open it once and it works everywhere —
            no signal required, no setup, no physical cards.
          </p>

          <h2>How it works</h2>
          <p>
            Kea is a static web app. Every deck is pre-loaded as JSON and cached
            by your browser, which means it keeps working even when you lose
            connection mid-game. Pick a game, pick a deck, and start playing.
            Your session is saved locally so you can pause, step away, and
            resume right where you left off.
          </p>

          <h2>The games</h2>
          <ul>
            <li>
              <strong>Charades</strong> — Act out a word or phrase without
              speaking while your team guesses.
            </li>
            <li>
              <strong>Trivia</strong> — Answer questions across a range of
              topics. Works solo or head-to-head.
            </li>
            <li>
              <strong>Taboo</strong> — Describe a word without using the
              forbidden clue words. Harder than it sounds.
            </li>
            <li>
              <strong>Just One</strong> — Cooperative word game: everyone writes
              a one-word clue, duplicates cancel out, and the guesser gets one
              shot.
            </li>
            <li>
              <strong>Monikers</strong> — Three rounds with the same cards:
              describe, one word, then act. Hilarity guaranteed.
            </li>
          </ul>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-5 border-t text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Kristian Garza. Built for outdoor adventures.</p>
        </footer>
      </div>
    </main>
  );
}
