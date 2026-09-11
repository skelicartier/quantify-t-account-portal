"use client";

import { Moon, Sun } from "lucide-react";

import { useConsoleTheme } from "@/components/shell/theme-scope";
import type { ConsoleTheme } from "@/lib/theme";

const OPTIONS: ReadonlyArray<{ value: ConsoleTheme; label: string; Icon: typeof Moon }> = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
];

/** Two icon buttons; the pressed one is the current theme. */
export function ThemeToggle() {
  const { theme, setTheme } = useConsoleTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Console theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          title={`${label} theme`}
          onClick={() => {
            if (theme !== value) setTheme(value);
          }}
        >
          <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
