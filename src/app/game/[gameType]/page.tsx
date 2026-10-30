import { notFound } from "next/navigation";
import { isGameType, GAME_TYPES } from "@/types";
import { DeckList } from "@/components/deck-selection/deck-list";
import { ChooseDeckHeading, GameIntro } from "@/components/deck-selection/game-intro";

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

  return (
    <main className="min-h-screen p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <GameIntro gameType={gameType} />

        <section>
          <ChooseDeckHeading />
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
