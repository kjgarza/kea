# Kea task runner
# Usage: just <recipe>

# Show available recipes when running just with no args.
default:
    @just --list

# Dependency management
install:
    bun install

# Development

dev:
    bun run dev

build:
    bun run build

start:
    bun run start

lint:
    bun run lint

typecheck:
    bunx tsc --noEmit

check:
    bun run lint && bunx tsc --noEmit

# Deck generation

generate:
    bun run generate

generate-dry:
    bun run generate:dry

generate-deck deck:
    bun scripts/generate-decks.ts --deck {{deck}}

# Playwright tests

test:
    bunx playwright test

test-ui:
    bunx playwright test --ui

test-headed:
    bunx playwright test --headed

test-debug:
    bunx playwright test --debug

test-file file:
    bunx playwright test {{file}}

pw-install:
    bunx playwright install

# Cleanup

clean:
    rm -rf .next out playwright-report test-results
