import Link from "next/link";
import {
  Drama,
  Brain,
  Ban,
  Lightbulb,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { GameMetadata } from "@/types/game";

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  drama: Drama,
  brain: Brain,
  ban: Ban,
  lightbulb: Lightbulb,
  users: Users,
};

interface GameTileProps {
  game: GameMetadata;
}

export function GameTile({ game }: GameTileProps) {
  const Icon = iconMap[game.icon] ?? Drama;

  return (
    <Link href={`/game/${game.type}`}>
      <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
        <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
          <div className="p-4 rounded-full bg-primary/10">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">{game.name}</h2>
          <p className="text-sm text-muted-foreground">{game.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
