import { GameGrid } from "@/components/home/game-grid";

export default function Home() {
  return (
    <main className="min-h-screen p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3">Party Card Games</h1>
          <p className="text-muted-foreground text-lg">
            Choose a game to get started
          </p>
        </header>
        <GameGrid />
      </div>
    </main>
  );
}
