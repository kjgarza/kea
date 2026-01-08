import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isGameType, GAMES, GAME_TYPES } from "@/types";
import { DeckList } from "@/components/deck-selection/deck-list";
import { Button } from "@/components/ui/button";

interface GamePageProps {
  params: Promise<{
    gameType: string;
  }>;
}

export default async function GamePage({ params }: GamePageProps) {
  const { gameType } = await params;

  if (!isGameType(gameType)) {
    notFound();
  }

  const game = GAMES[gameType];

  return (
    <main className="min-h-screen p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to games
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-2">{game.name}</h1>
          <p className="text-muted-foreground">{game.description}</p>
        </header>

        <section>
          <h2 className="text-xl font-semibold mb-4">Choose a Deck</h2>
          <DeckList gameType={gameType} />
        </section>
      </div>
    </main>
  );
}

export function generateStaticParams() {
  return GAME_TYPES.map((gameType) => ({
    gameType,
  }));
}
