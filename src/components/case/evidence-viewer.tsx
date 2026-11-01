"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Evidence } from "@/types/card";
import type { TranslateFn } from "@/lib/i18n";
import { caseAssetPath } from "@/lib/data/case-assets";
import { withBasePath } from "@/lib/utils/base-path";
import { Markdown } from "@/components/markdown/markdown";
import { EVIDENCE_ICONS } from "./evidence-drawer";
import { ZoomableImage } from "./zoomable-image";

interface Props {
  deckId: string;
  /** Opened evidence, in the order it was opened (swipe order). */
  items: Evidence[];
  /** Id being viewed, or null when the viewer is closed. */
  viewingId: string | null;
  onViewingChange: (id: string | null) => void;
  t: TranslateFn;
}

/** Horizontal distance (px) a swipe needs to change items. */
const SWIPE_MIN_PX = 60;

/** URL of an evidence file, through the deck asset folder and the base path. */
export function evidenceUrl(deckId: string, evidence: Evidence): string | null {
  return evidence.src ? withBasePath(caseAssetPath(deckId, evidence.src)) : null;
}

/**
 * F13: full-screen viewer for opened evidence. Text kinds render as Markdown,
 * images and maps zoom (pinch, double-tap, buttons), PDFs embed with a
 * download fallback. Swipe left/right (pointer events) or use the arrows to
 * move between opened items.
 */
export function EvidenceViewer({ deckId, items, viewingId, onViewingChange, t }: Props) {
  const index = items.findIndex((e) => e.id === viewingId);
  const evidence = index >= 0 ? items[index] : null;
  const [zoomed, setZoomed] = useState(false);
  const swipe = useRef<{ x: number; y: number; id: number; multi: boolean } | null>(null);

  const go = useCallback(
    (delta: number) => {
      const next = items[index + delta];
      if (next) {
        setZoomed(false);
        onViewingChange(next.id);
      }
    },
    [index, items, onViewingChange]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (swipe.current) {
      swipe.current.multi = true; // second finger: a pinch, not a swipe
      return;
    }
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, multi: false };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipe.current;
    if (!start || start.id !== e.pointerId) return;
    swipe.current = null;
    if (start.multi || zoomed) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };
  const onPointerCancel = () => {
    swipe.current = null;
  };

  const Icon = evidence ? EVIDENCE_ICONS[evidence.kind] : null;
  const url = evidence ? evidenceUrl(deckId, evidence) : null;

  return (
    <DialogPrimitive.Root
      open={evidence !== null}
      onOpenChange={(open) => {
        if (!open) onViewingChange(null);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
          data-testid="case-viewer"
          data-evidence-id={evidence?.id}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
        >
          {evidence && (
            <>
              <header className="flex items-center gap-3 border-b bg-white/90 px-4 py-3">
                {Icon && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-case/15 text-case-dark">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title
                    className="font-display text-lg font-bold leading-tight"
                    data-testid="case-viewer-title"
                  >
                    {evidence.title}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-xs text-muted-foreground">
                    {t(`case.evidence.kind.${evidence.kind}`)} ·{" "}
                    <span data-testid="case-viewer-counter">
                      {t("case.viewer.counter", { index: index + 1, total: items.length })}
                    </span>
                  </DialogPrimitive.Description>
                </div>
                <DialogPrimitive.Close
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                  aria-label={t("case.viewer.close")}
                  data-testid="case-viewer-close"
                >
                  <X className="h-5 w-5" />
                </DialogPrimitive.Close>
              </header>

              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
                style={{ touchAction: zoomed ? "none" : "pan-y" }}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                data-testid="case-viewer-body"
              >
                <div className="mx-auto w-full max-w-lg">
                  <EvidenceBody
                    key={evidence.id}
                    evidence={evidence}
                    url={url}
                    onZoomChange={setZoomed}
                    t={t}
                  />
                </div>
              </div>

              <footer className="flex items-center gap-3 border-t bg-white/90 px-4 pt-3 pb-6">
                <NavButton
                  label={t("case.viewer.previous")}
                  disabled={index <= 0}
                  onClick={() => go(-1)}
                  testId="case-viewer-prev"
                >
                  <ChevronLeft className="h-6 w-6" />
                </NavButton>
                <p className="flex-1 text-center text-xs text-muted-foreground">
                  {t("case.viewer.zoomHint")}
                </p>
                <NavButton
                  label={t("case.viewer.next")}
                  disabled={index >= items.length - 1}
                  onClick={() => go(1)}
                  testId="case-viewer-next"
                >
                  <ChevronRight className="h-6 w-6" />
                </NavButton>
              </footer>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EvidenceBody({
  evidence,
  url,
  onZoomChange,
  t,
}: {
  evidence: Evidence;
  url: string | null;
  onZoomChange: (zoomed: boolean) => void;
  t: TranslateFn;
}) {
  switch (evidence.kind) {
    case "document":
    case "interview":
    case "phone_log":
      return (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <Markdown source={evidence.content ?? ""} data-testid="case-viewer-text" />
        </div>
      );
    case "image":
    case "map":
      return url ? (
        <div className="space-y-3">
          <ZoomableImage src={url} alt={evidence.title} onZoomChange={onZoomChange} t={t} />
          {evidence.content && <Markdown source={evidence.content} className="text-sm" />}
        </div>
      ) : null;
    case "pdf":
      return url ? (
        <div className="space-y-3">
          <object
            data={url}
            type="application/pdf"
            className="h-[65dvh] w-full rounded-2xl border bg-white"
            data-testid="case-viewer-pdf"
            aria-label={evidence.title}
          >
            <p className="p-4 text-sm text-muted-foreground">{t("case.viewer.pdfFallback")}</p>
          </object>
          <DownloadLink url={url} t={t} />
          {evidence.content && <Markdown source={evidence.content} className="text-sm" />}
        </div>
      ) : null;
  }
}

function DownloadLink({ url, t }: { url: string; t: TranslateFn }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download
      className="flex h-12 items-center justify-center gap-2 rounded-2xl border bg-white font-semibold"
      data-testid="case-viewer-download"
    >
      <Download className="h-4 w-4" />
      {t("case.viewer.download")}
    </a>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  testId,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className="flex h-12 w-12 items-center justify-center rounded-full border bg-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
