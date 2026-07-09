"use client";

import { useEffect } from "react";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyTheme = () => {
      const saved = localStorage.getItem("app_settings");
      if (saved) {
        try {
          const settings = JSON.parse(saved);
          if (settings.theme === "dark") {
            document.documentElement.setAttribute("data-theme", "dark");
          } else {
            document.documentElement.removeAttribute("data-theme");
          }
        } catch (e) {
          console.error(e);
        }
      }
    };

    // Apply immediately on mount
    applyTheme();

    // Listen for changes from SettingsModal
    window.addEventListener("settingsChanged", applyTheme);
    return () => window.removeEventListener("settingsChanged", applyTheme);
  }, []);

  return <>{children}</>;
}
