"use client";

import { useParams } from "next/navigation";
import { PlayScreen } from "@/components/play/play-screen";

export default function PlayClient() {
  const params = useParams<{ deckId: string }>();

  return <PlayScreen deckId={params.deckId} />;
}
