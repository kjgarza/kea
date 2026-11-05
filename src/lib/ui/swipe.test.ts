import { describe, expect, test } from "bun:test";
import { swipeOutcome } from "./swipe";

describe("swipeOutcome", () => {
  test("a long drag sends the card that way", () => {
    expect(swipeOutcome(150, 0)).toBe(1);
    expect(swipeOutcome(-150, 0)).toBe(-1);
  });

  test("a short drag snaps back", () => {
    expect(swipeOutcome(40, 0)).toBeNull();
    expect(swipeOutcome(-40, 0)).toBeNull();
  });

  test("a fast flick with real travel sends the card", () => {
    expect(swipeOutcome(50, 900)).toBe(1);
    expect(swipeOutcome(-50, -900)).toBe(-1);
  });

  test("a jerk with hardly any travel does nothing", () => {
    expect(swipeOutcome(15, 2000)).toBeNull();
    expect(swipeOutcome(-15, -2000)).toBeNull();
  });

  test("flicking back against the drag cancels it", () => {
    expect(swipeOutcome(-150, 800)).toBeNull();
    expect(swipeOutcome(150, -800)).toBeNull();
  });

  test("a slight reversal at the end of a long drag still counts", () => {
    expect(swipeOutcome(-150, 100)).toBe(-1);
  });
});
