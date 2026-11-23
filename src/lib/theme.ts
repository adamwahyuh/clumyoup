import { getCurrentWindow } from "@tauri-apps/api/window";

export type Theme = "system" | "light" | "dark";
const KEY = "clumyoup.theme";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemDark.matches);
  document.documentElement.classList.toggle("dark", dark);
  // Native title bar follows too; failure only leaves the title bar on the OS theme
  getCurrentWindow().setTheme(theme === "system" ? null : theme).catch(() => {});
}

systemDark.addEventListener("change", () => {
  if (getTheme() === "system") applyTheme("system");
});
