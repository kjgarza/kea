# Plan: Fix Alert Button + Improve Background UI

## Goal
Fix the Taboo alert button to only play sound (no timer reset/stop), and add geometric dot pattern + stronger gradients to the play screen background.

## Phases
- [ ] Phase 1: Fix alert button — only play sound
- [ ] Phase 2: Strengthen background gradients
- [ ] Phase 3: Add geometric dot pattern CSS utility
- [ ] Phase 4: Add pattern overlay to play screen layout

---

## Phase 1: Fix Alert Button

**File:** `src/components/play/play-screen.tsx`
**Lines:** 110-114

**Current code:**
```typescript
const handleTabooAlert = useCallback(() => {
  setTabooTimerActive(false);
  setTabooTimerSeconds(TABOO_TIMER_SECONDS);
  playTabooSound(800);
}, [playTabooSound]);
```

**Replace with:**
```typescript
const handleTabooAlert = useCallback(() => {
  playTabooSound(800);
}, [playTabooSound]);
```

**Rationale:** The alert button should only trigger the buzzer sound. The timer keeps running — the opposing team just flags that a taboo word was said. The game master decides what to do next (pass, etc.) using the other buttons.

---

## Phase 2: Strengthen Background Gradients

**File:** `src/components/play/play-screen.tsx`
**Lines:** 31-37

**Current code:**
```typescript
const gameGradients: Record<GameType, string> = {
  charades: "from-charades/5 to-charades/10",
  trivia: "from-trivia/5 to-trivia/10",
  taboo: "from-taboo/5 to-taboo/10",
  justone: "from-justone/5 to-justone/10",
  monikers: "from-monikers/5 to-monikers/10",
};
```

**Replace with:**
```typescript
const gameGradients: Record<GameType, string> = {
  charades: "from-charades/15 via-charades/8 to-charades/20",
  trivia: "from-trivia/15 via-trivia/8 to-trivia/20",
  taboo: "from-taboo/15 via-taboo/8 to-taboo/20",
  justone: "from-justone/15 via-justone/8 to-justone/20",
  monikers: "from-monikers/15 via-monikers/8 to-monikers/20",
};
```

**Rationale:** The current 5-10% opacity is barely visible. Bumping to 15-8-20% with a three-stop gradient creates a more dynamic, visible color wash. The `via` midpoint at lower opacity creates a subtle "breathing" effect rather than a flat linear fade.

---

## Phase 3: Add Geometric Dot Pattern CSS

**File:** `src/app/globals.css`
**Location:** After the `@layer base` block (end of file)

**Add:**
```css
/* Geometric dot pattern overlay for game backgrounds */
.game-bg-pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.05;
  pointer-events: none;
  z-index: 0;
}
```

**Rationale:** A CSS-only repeating dot grid. Uses `currentColor` so we can tint it per-game via a text color class. `pointer-events: none` ensures it doesn't interfere with clicks. Very subtle at 5% opacity — adds texture without distraction.

---

## Phase 4: Add Pattern Overlay to Play Screen

**File:** `src/components/play/play-screen.tsx`

### 4a. Main game view (line 209)

**Current:**
```tsx
<div className={`min-h-screen flex flex-col bg-gradient-to-b ${bgGradient}`}>
```

**Replace with:**
```tsx
<div className={`min-h-screen flex flex-col bg-gradient-to-b ${bgGradient} relative`}>
  <div className={`game-bg-pattern ${gamePatternColors[deck!.gameType]}`} />
```

### 4b. Add game pattern color map (near line 31, after `gameGradients`)

**Add:**
```typescript
const gamePatternColors: Record<GameType, string> = {
  charades: "text-charades",
  trivia: "text-trivia",
  taboo: "text-taboo",
  justone: "text-justone",
  monikers: "text-monikers",
};
```

### 4c. Ensure content stays above pattern

Add `relative z-10` to the `<header>` and `<main>` elements so they sit above the pattern overlay:
- Header (line 211): add `relative z-10`
- Main (line 243): add `relative z-10`

### 4d. Also apply to Start, Complete, and Round Complete screens

Apply the same pattern overlay + stronger gradients to these screens so the UI is consistent:
- `StartScreen` (line 340): add `relative` to container, add pattern div
- `CompleteScreen` (line 422): add `relative` to container, add pattern div
- `RoundCompleteScreen` (line 487): add `relative` to container, add pattern div

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/components/play/play-screen.tsx` | Remove timer logic from alert handler; bump gradient opacities; add `gamePatternColors` map; add pattern overlay div + z-index adjustments to all screen states |
| `src/app/globals.css` | Add `.game-bg-pattern` utility class |

## Status
**Plan complete — ready for execution.**
