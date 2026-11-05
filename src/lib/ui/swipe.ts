export type SwipeDirection = 1 | -1;

const SWIPE_DISTANCE = 96;
const FLICK_VELOCITY = 520;
const FLICK_MIN_DISTANCE = 32;

/**
 * Which way a released card goes, or null if it should snap back.
 *
 * The drag's travel decides the direction. A long drag or a fast flick the same
 * way sends the card; a flick back the other way cancels; and a jerk with hardly
 * any travel does nothing, so an accidental movement can't score a card.
 */
export function swipeOutcome(offsetX: number, velocityX: number): SwipeDirection | null {
  const direction: SwipeDirection = offsetX >= 0 ? 1 : -1;
  const travel = Math.abs(offsetX);
  const speed = velocityX * direction;

  if (speed < -FLICK_VELOCITY) return null;
  if (travel > SWIPE_DISTANCE) return direction;
  if (travel > FLICK_MIN_DISTANCE && speed > FLICK_VELOCITY) return direction;
  return null;
}

/** Drag distance at which the card's label is fully shown. */
export const SWIPE_LABEL_DISTANCE = SWIPE_DISTANCE;
