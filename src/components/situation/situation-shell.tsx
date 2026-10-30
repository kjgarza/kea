"use client";

/**
 * Layout for every situation screen inside the play chrome: the body scrolls
 * with the page and the action area sticks to the bottom of the viewport, in
 * thumb reach (one-handed on a 375px phone).
 */
interface Props {
  children: React.ReactNode;
  /** Controls pinned to the bottom of the screen. */
  footer?: React.ReactNode;
  testId?: string;
}

export function SituationShell({ children, footer, testId }: Props) {
  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid={testId}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <div className="mx-auto w-full max-w-lg space-y-4">{children}</div>
      </div>
      {footer && (
        <div className="sticky bottom-0 z-20 px-4 pt-3 pb-6 bg-background/85 backdrop-blur-md border-t border-black/5">
          <div className="mx-auto w-full max-w-lg space-y-3">{footer}</div>
        </div>
      )}
    </div>
  );
}

/** White rounded panel used for blocks of content. */
export function SituationPanel({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-3xl bg-white/90 backdrop-blur-sm shadow-sm border p-5 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
