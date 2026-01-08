"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play } from "lucide-react";

interface EndTurnOverlayProps {
  onContinue: () => void;
  cardsRemaining: number;
}

export function EndTurnOverlay({ onContinue, cardsRemaining }: EndTurnOverlayProps) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-xl">Turn Ended!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {cardsRemaining} card{cardsRemaining !== 1 ? "s" : ""} remaining
          </p>
          <p className="text-sm text-muted-foreground">
            Pass the phone to the next team
          </p>
          <Button size="lg" className="w-full" onClick={onContinue}>
            <Play className="h-5 w-5 mr-2" />
            Start Turn
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
