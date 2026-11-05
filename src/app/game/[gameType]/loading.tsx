import { Skeleton } from "@/components/ui/skeleton";

export default function GameLoading() {
  return (
    <main className="on-table min-h-dvh">
      <Skeleton className="h-64 rounded-t-none rounded-b-[1.75rem]" />
      <div className="flex flex-col gap-2 px-5 pt-6">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
