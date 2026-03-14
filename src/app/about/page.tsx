import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Kea",
  description: "Why Kea was built and how it works.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen p-6 md:p-10 relative overflow-hidden">
      {/* Decorative background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-justone/10 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-56 h-56 rounded-full bg-trivia/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="max-w-2xl mx-auto relative flex flex-col min-h-[calc(100vh-3rem)]">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10 w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to games
        </Link>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-bold font-display mb-10 bg-gradient-to-r from-justone via-primary to-trivia bg-clip-text text-transparent">
          About Kea
        </h1>

        {/* Prose content */}
        <div className="prose prose-neutral dark:prose-invert max-w-none flex-1">
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
        <footer className="mt-16 pt-6 border-t border-border/40 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Kea. Built for outdoor adventures.</p>
        </footer>
      </div>
    </main>
  );
}
