"use client";

import { Moon, Sun } from "lucide-react";

import { useConsoleTheme } from "@/components/shell/theme-scope";
import { CONSOLE_THEMES } from "@/lib/theme";
import type { ConsoleTheme } from "@/lib/theme";

const OPTIONS: ReadonlyArray<{ value: ConsoleTheme; label: string; Icon: typeof Moon }> = [
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "light", label: "Light", Icon: Sun },
];

export function ThemeToggle() {
  const { theme, setTheme } = useConsoleTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Console theme">
      {OPTIONS.filter((option) => CONSOLE_THEMES.includes(option.value)).map(
        ({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => {
              if (theme !== value) setTheme(value);
            }}
          >
            <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </button>
        ),
      )}
    </div>
  );
}
