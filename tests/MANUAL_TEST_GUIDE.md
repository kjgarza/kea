# Manual Testing Guide: Card View Spacing Fix

## Issue Fixed
The action buttons (Pass/Next) were appearing below the viewport, requiring users to scroll down to see them.

## Changes Made
Modified `/src/components/play/play-screen.tsx` (lines 171-173):

### Before:
```tsx
<main className="flex-1 flex flex-col">
  <div className="flex-1 flex items-center justify-center p-4">
    <div className="w-full max-w-lg aspect-[3/4] bg-card rounded-xl shadow-lg border overflow-hidden">
```

### After:
```tsx
<main className="flex-1 flex flex-col min-h-0">
  <div className="flex items-center justify-center p-4 min-h-0 overflow-auto">
    <div className="w-full max-w-lg aspect-[3/4] max-h-[calc(100vh-180px)] bg-card rounded-xl shadow-lg border overflow-hidden">
```

## Key Changes:
1. **Added `min-h-0`** to the main element - prevents flex children from overflowing viewport
2. **Removed `flex-1`** from card container - stops it from trying to fill all available vertical space
3. **Added `max-h-[calc(100vh-180px)]`** to the card - ensures card never exceeds viewport height (accounting for header ~64px, action bar ~80px, and padding)
4. **Added `min-h-0 overflow-auto`** to allow internal scrolling if needed

## Manual Testing Steps

### Desktop Testing (Chrome/Firefox/Safari)
1. Start the development server: `bun run dev`
2. Navigate to `http://localhost:3000`
3. Select any game type (e.g., Charades, Trivia, Taboo)
4. Choose a deck and click "Start Game"
5. **Verify:** Action buttons (Pass/Next) are visible at the bottom without scrolling
6. **Verify:** The card is centered and fully visible
7. **Verify:** No scrolling is required to access the buttons

### Mobile Testing (iPhone/Android)
1. Open Chrome DevTools (F12)
2. Click the device toolbar icon (Ctrl+Shift+M / Cmd+Shift+M)
3. Select different device presets:
   - iPhone SE (375x667)
   - iPhone 12 (390x844)
   - Pixel 5 (393x851)
   - iPad (768x1024)
4. For each device:
   - Navigate to a play screen
   - **Verify:** Buttons are visible without scrolling
   - **Verify:** Card fits within viewport
   - **Verify:** No content is cut off

### Test Different Game Types
Test with each game type to ensure buttons are visible:
- **Charades:** Simple card with large text
- **Trivia:** Card with question, multiple choice options, and reveal button
- **Taboo:** Card with target word and forbidden words list
- **Just One:** Simple card with target word
- **Monikers:** Card with phrase and round-specific buttons

### Edge Cases to Test
1. **Very small screens:** 320x568 (iPhone 5/SE)
2. **Large screens:** 1920x1080 desktop
3. **Landscape mode:** Rotate mobile device
4. **Long content:** Trivia cards with long questions or many options
5. **Browser zoom:** Test at 150% and 200% zoom levels

## Expected Results
✅ Action buttons are always visible at the bottom of the viewport
✅ No scrolling is required to access buttons
✅ Card content is fully visible and centered
✅ Layout works across all screen sizes
✅ No content overflow or clipping

## Automated Testing (When Available)
Run the Playwright tests to verify button visibility:
```bash
# Install browsers (requires network access)
bunx playwright install

# Run tests
bunx playwright test tests/card-view-spacing.spec.ts

# Run tests with UI
bunx playwright test tests/card-view-spacing.spec.ts --ui
```

## Screenshots to Capture
When testing manually, verify these views:
1. Mobile portrait (375x667) - buttons visible
2. Mobile landscape (667x375) - buttons visible
3. Tablet (768x1024) - buttons visible
4. Desktop (1280x720) - buttons visible
5. Before/after comparison showing the fix
