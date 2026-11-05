"use client";

import {
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import type { useCardFlight } from "@/hooks/use-card-flight";
import { SWIPE_LABEL_DISTANCE, swipeOutcome, type SwipeDirection } from "@/lib/ui/swipe";

interface Props {
  /** Identity of the card. A new key deals a new card. */
  cardKey: string;
  children: React.ReactNode;
  direction: React.RefObject<SwipeDirection>;
  /** From `useCardFlight`: runs an action after setting which way the card leaves. */
  fly: ReturnType<typeof useCardFlight>["fly"];
  /** Swipe left. Omit to turn the gesture off. */
  onSwipeLeft?: () => void;
  /** Swipe right. Omit to turn the gesture off. */
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
}

/**
 * The current card on top of the deck, filling all the height the controls
 * leave free. The card itself is a size container, so faces size their type
 * in `cqi` (see src/lib/ui/fit-type.ts).
 */
export function CardStage({
  cardKey,
  children,
  direction,
  fly,
  onSwipeLeft,
  onSwipeRight,
  leftLabel,
  rightLabel,
}: Props) {
  return (
    <div className="relative mx-4 mt-1 mb-2 min-h-0 flex-1">
      {/* The rest of the deck, showing under the current card. */}
      <div aria-hidden className="absolute inset-x-3 top-3 -bottom-2 rounded-[1.75rem] bg-game-deep" />
      <div aria-hidden className="absolute inset-x-1.5 top-1.5 -bottom-1 rounded-[1.75rem] bg-game opacity-60" />
      <AnimatePresence initial={false} custom={direction.current}>
        <FlyingCard
          key={cardKey}
          fly={fly}
          onSwipeLeft={onSwipeLeft}
          onSwipeRight={onSwipeRight}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        >
          {children}
        </FlyingCard>
      </AnimatePresence>
    </div>
  );
}

const cardMotion = {
  enter: { scale: 0.96, y: 10 },
  rest: { scale: 1, y: 0, x: 0, rotate: 0, opacity: 1 },
  exit: (to: SwipeDirection) => ({ x: `${to * 115}%`, rotate: to * 10, opacity: 0 }),
};

function FlyingCard({
  children,
  fly,
  onSwipeLeft,
  onSwipeRight,
  leftLabel,
  rightLabel,
}: Omit<Props, "cardKey" | "direction">) {
  const reduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-9, 9]);
  const rightOpacity = useTransform(x, [24, SWIPE_LABEL_DISTANCE], [0, 1]);
  const leftOpacity = useTransform(x, [-SWIPE_LABEL_DISTANCE, -24], [1, 0]);

  const canSwipe = !reduceMotion && Boolean(onSwipeLeft || onSwipeRight);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const outcome = swipeOutcome(info.offset.x, info.velocity.x);
    if (outcome === 1 && onSwipeRight) fly(1, onSwipeRight)();
    else if (outcome === -1 && onSwipeLeft) fly(-1, onSwipeLeft)();
  };

  return (
    <motion.div
      // The outgoing card stays on screen for a moment; keep it out of reach.
      aria-hidden={!isPresent}
      inert={!isPresent}
      className="absolute inset-0 touch-pan-y select-none [-webkit-touch-callout:none] [container-type:size]"
      // The thrown card stays above the next one until it has left.
      style={{ x, rotate, zIndex: isPresent ? 1 : 2 }}
      variants={reduceMotion ? undefined : cardMotion}
      initial="enter"
      animate="rest"
      exit="exit"
      transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
      drag={canSwipe ? "x" : false}
      dragDirectionLock
      dragSnapToOrigin
      dragElastic={0.85}
      dragConstraints={{
        left: onSwipeLeft ? -400 : 0,
        right: onSwipeRight ? 400 : 0,
      }}
      onDragEnd={onDragEnd}
    >
      {children}
      {canSwipe && (
        <>
          <Stamp label={rightLabel} opacity={rightOpacity} side="left" />
          <Stamp label={leftLabel} opacity={leftOpacity} side="right" />
        </>
      )}
    </motion.div>
  );
}

function Stamp({
  label,
  opacity,
  side,
}: {
  label?: string;
  opacity: ReturnType<typeof useTransform<number, number>>;
  side: "left" | "right";
}) {
  if (!label) return null;
  return (
    <motion.span
      aria-hidden
      style={{ opacity }}
      className={`font-display pointer-events-none absolute top-5 rounded-lg border-4 border-current bg-paper px-3 py-1 text-2xl font-extrabold text-ink ${
        side === "left" ? "left-5 -rotate-6" : "right-5 rotate-6"
      }`}
    >
      {label}
    </motion.span>
  );
}
