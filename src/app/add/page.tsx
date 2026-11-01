import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { PhotoQuickAddScreen } from "@/components/authoring/photo-quick-add-screen";
import { PUZZLE_PACK_DIR, packNameFromFileName } from "@/lib/puzzles/puzzle-pack";

export const metadata: Metadata = {
  title: "Add a puzzle — Kea",
  description: "Turn a photographed puzzle card into a puzzle pack file.",
};

/** Pack files in the repo at build time (static export), for suggestions and the "already exists" check. */
function existingPackFiles(): string[] {
  try {
    return readdirSync(join(process.cwd(), PUZZLE_PACK_DIR))
      .filter((name) => packNameFromFileName(name) && /\.ya?ml$/.test(name))
      .map((name) => `${PUZZLE_PACK_DIR}/${name}`)
      .sort();
  } catch {
    return [];
  }
}

function existingDeckIds(): string[] {
  try {
    const index = JSON.parse(readFileSync(join(process.cwd(), "public/decks/index.json"), "utf8")) as {
      decks: { deckId: string }[];
    };
    return index.decks.map((d) => d.deckId).sort();
  } catch {
    return [];
  }
}

export default function AddPuzzlePage() {
  return <PhotoQuickAddScreen packFiles={existingPackFiles()} deckIds={existingDeckIds()} />;
}
