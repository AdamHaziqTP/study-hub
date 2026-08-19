"use client";

/**
 * Task 25 — Dark mode toggle (roadmap #13).
 *
 * Class-based dark mode helpers. The choice is persisted in localStorage
 * (`study-hub:theme`) and applied by toggling `.dark` on <html>, which Tailwind
 * v4's custom `dark:` variant (see globals.css) responds to. On first visit the
 * saved choice wins; otherwise the OS `prefers-color-scheme` is used (matching
 * what the pre-paint script in layout.tsx applies, so there is no theme flash).
 */
export type Theme = "light" | "dark";

const THEME_KEY = "study-hub:theme";

/** The user's saved theme, or the OS preference when none is saved. */
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Apply + persist a theme (toggles `.dark` on <html>). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable — theme just won't persist.
  }
}
