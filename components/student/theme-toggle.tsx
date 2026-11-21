"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, getServerTheme, setTheme, subscribeTheme } from "@/lib/theme";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const label = theme === "dark" ? "Switch to light mode." : "Switch to dark mode.";
  return <button type="button" className="ca-theme-toggle" aria-label={label} title={label}
    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
    {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
  </button>;
}
