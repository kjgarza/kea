"use client";

import { useId, type ReactNode } from "react";

interface Props {
  /** The hover/focus message, e.g. "Coming in a later release". */
  message: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Wraps a disabled control and shows `message` on hover or keyboard focus.
 * Disabled buttons don't fire pointer events, so the wrapper owns the hover
 * and is focusable itself; `title` is the fallback for long-press/assistive
 * tech.
 */
export function ComingLaterHint({ message, children, className = "", testId }: Props) {
  const id = useId();
  return (
    <span
      className={`group relative block ${className}`}
      title={message}
      tabIndex={0}
      aria-describedby={id}
      data-testid={testId}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-center text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus:opacity-100"
      >
        {message}
      </span>
    </span>
  );
}
