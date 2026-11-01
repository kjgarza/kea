"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { TranslateFn } from "@/lib/i18n";

interface Props {
  src: string;
  alt: string;
  /** Called when the image goes in/out of zoom (the viewer stops swiping while zoomed). */
  onZoomChange?: (zoomed: boolean) => void;
  t: TranslateFn;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const IDENTITY: View = { scale: 1, x: 0, y: 0 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * F13: an image with pinch-zoom (two pointers), drag to pan while zoomed,
 * double-tap to toggle 2.5×, wheel zoom and +/− buttons. Uses pointer events
 * with `touch-action: none` and a CSS transform; no library. Key it by `src`
 * so a new image starts unzoomed.
 */
export function ZoomableImage({ src, alt, onZoomChange, t }: Props) {
  const [view, setView] = useState<View>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef(0);
  const [gesturing, setGesturing] = useState(false);

  const zoomed = view.scale > 1.01;
  useEffect(() => {
    onZoomChange?.(zoomed);
  }, [zoomed, onZoomChange]);


  const zoomTo = useCallback((scale: number) => {
    setView((v) => {
      const next = clamp(scale, MIN_SCALE, MAX_SCALE);
      if (next <= 1.01) return IDENTITY;
      const ratio = next / v.scale;
      return { scale: next, x: v.x * ratio, y: v.y * ratio };
    });
  }, []);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesturing(true);
    if (pointers.current.size === 2) {
      pinch.current = { distance: distance(), scale: view.scale };
    } else if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        zoomTo(view.scale > 1.01 ? 1 : 2.5);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const d = distance();
      if (pinch.current.distance > 0) zoomTo((pinch.current.scale * d) / pinch.current.distance);
    } else if (pointers.current.size === 1 && view.scale > 1.01) {
      // Pan while zoomed; the viewer does not swipe then.
      e.stopPropagation();
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setGesturing(false);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 1) return;
    zoomTo(view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
  };

  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-2xl bg-white border select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
        data-testid="case-viewer-image"
        data-zoomed={zoomed ? "true" : "false"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimisation */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="w-full h-auto max-h-[65dvh] object-contain origin-center will-change-transform"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: gesturing ? "none" : "transform 150ms ease-out",
          }}
        />
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1">
        <ZoomButton label={t("case.viewer.zoomOut")} onClick={() => zoomTo(view.scale / 1.5)} disabled={!zoomed}>
          <Minus className="h-4 w-4" />
        </ZoomButton>
        <ZoomButton label={t("case.viewer.resetZoom")} onClick={() => zoomTo(1)} disabled={!zoomed}>
          <RotateCcw className="h-4 w-4" />
        </ZoomButton>
        <ZoomButton label={t("case.viewer.zoomIn")} onClick={() => zoomTo(view.scale * 1.5)} disabled={view.scale >= MAX_SCALE}>
          <Plus className="h-4 w-4" />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
