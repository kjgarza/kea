import PlayClient from "./play-client";
import deckIndex from "../../../../public/decks/index.json";

export default function PlayPage() {
  return <PlayClient />;
}

export function generateStaticParams() {
  return deckIndex.decks.map((deck) => ({
    deckId: deck.deckId,
  }));
}
