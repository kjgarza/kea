import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="on-table feathers pt-safe flex min-h-dvh flex-col justify-between px-5 pb-safe-5">
      <div className="pt-16">
        <h1 className="display-type text-[7rem] text-flash [--type-width:120%]">404</h1>
        <h2 className="mt-4 text-3xl font-extrabold">Page not found</h2>
        <p className="mt-2 text-lg text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Button asChild size="lg" className="w-full">
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
