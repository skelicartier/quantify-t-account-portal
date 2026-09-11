"use client";

import { createContext, startTransition, useContext, useOptimistic } from "react";
import type { ReactNode } from "react";

import type { ShellSection } from "@/components/shell/shell-types";
import { DEFAULT_CONSOLE_THEME } from "@/lib/theme";
import type { ConsoleTheme } from "@/lib/theme";

type ThemeContextValue = {
  theme: ConsoleTheme;
  setTheme: (theme: ConsoleTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_CONSOLE_THEME,
  setTheme: () => undefined,
});

type ThemeScopeProps = {
  section: ShellSection;
  theme: ConsoleTheme;
  /** Persists the choice; the frame flips optimistically and settles on the server value. */
  action?: ((formData: FormData) => Promise<void>) | undefined;
  children: ReactNode;
};

/**
 * The `.shell` element with the theme attribute the stylesheet keys on. Only the console
 * lives inside it — the sign-in pages sit outside and stay dark.
 */
export function ThemeScope({ section, theme, action, children }: ThemeScopeProps) {
  const [optimisticTheme, showTheme] = useOptimistic(theme);

  function setTheme(next: ConsoleTheme) {
    startTransition(async () => {
      showTheme(next);
      if (!action) return;
      const formData = new FormData();
      formData.set("theme", next);
      await action(formData);
    });
  }

  return (
    <ThemeContext.Provider value={{ theme: optimisticTheme, setTheme }}>
      <div className="shell" data-section={section} data-theme={optimisticTheme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useConsoleTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
