import type { Metadata } from "next";
import { HistoryScreen } from "@/components/history/history-screen";

export const metadata: Metadata = {
  title: "History — Kea",
  description: "Puzzles you have finished on this phone.",
};

export default function HistoryPage() {
  return <HistoryScreen />;
}
