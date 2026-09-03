"use client";

import { useDarkMode } from "@/components/ui";

/** Aplica la clase `.dark` en <html> en toda página, tenga o no <ThemeToggle/>. */
export function ThemeInit() {
  useDarkMode();
  return null;
}
