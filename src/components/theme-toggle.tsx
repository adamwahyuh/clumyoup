import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTheme } from "@/lib/theme";

const isDark = () => document.documentElement.classList.contains("dark");

/** Switches between light and dark. Until first used, the app follows the system theme. */
export function ThemeToggle() {
  const [dark, setDark] = useState(isDark);

  // theme.ts re-applies the system theme on change; keep the icon in step with it
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(isDark());
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      onClick={() => {
        setTheme(dark ? "light" : "dark");
        setDark(!dark);
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
