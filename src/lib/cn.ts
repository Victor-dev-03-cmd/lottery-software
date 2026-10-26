import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class strings safely.
 * Resolves conflicts (e.g. `p-2 p-4` → `p-4`) and conditionally
 * includes classes. Uses clsx for conditional logic + tailwind-merge
 * for conflict resolution.
 *
 * Usage:
 *   cn("px-4 py-2", isActive && "bg-brand text-on-brand", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
