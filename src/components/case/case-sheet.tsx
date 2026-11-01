"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Controls pinned under the scrolling body. */
  footer?: React.ReactNode;
  testId?: string;
  className?: string;
}

/**
 * Bottom sheet (a Radix dialog docked to the bottom of the screen) used for
 * the evidence drawer, the notes and the accusation form: full width on a
 * phone, thumb-reachable, scrolls inside.
 */
export function CaseSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  testId,
  className,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={testId}
        className={cn(
          "top-auto bottom-0 left-0 translate-x-0 translate-y-0 max-w-none sm:max-w-none w-full",
          "rounded-t-3xl rounded-b-none border-x-0 border-b-0 p-0 gap-0",
          "max-h-[88dvh] flex flex-col",
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
          className
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted" aria-hidden />
        <DialogHeader className="px-5 pt-3 pb-2 text-left">
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="mx-auto w-full max-w-lg">{children}</div>
        </div>
        {footer && (
          <div className="border-t px-5 pt-3 pb-6">
            <div className="mx-auto w-full max-w-lg space-y-2">{footer}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
