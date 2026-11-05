import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The safe-area utilities in globals.css are padding, so later padding replaces them.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { pb: ["pb-safe-3", "pb-safe-5"], pt: ["pt-safe"] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
