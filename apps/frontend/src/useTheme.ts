import { useCallback, useEffect, useState } from "react";

export type ThemeName = "light" | "dark";
export type ThemePreference = ThemeName | "system";

const THEME_PREFERENCE_STORAGE_KEY = "mylife.theme-preference.v1";
const THEME_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** OS設定から現在のテーマを判定する。 */
function getSystemTheme(): ThemeName {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia(THEME_DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

/** 保存済みテーマ設定を読み込み、無効値は system 扱いにする。 */
function loadThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  const raw = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return "system";
}

/** テーマ設定をローカルへ永続化する。 */
function saveThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
}

/** テーマ制御（OS追従・手動上書き・永続化）を提供する。 */
export function useTheme(): {
  theme: ThemeName;
  toggleTheme: () => void;
  resetThemePreference: () => void;
} {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    loadThemePreference(),
  );
  const [theme, setTheme] = useState<ThemeName>(() => {
    const preference = loadThemePreference();
    return preference === "system" ? getSystemTheme() : preference;
  });

  useEffect(() => {
    saveThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (themePreference !== "system") {
      setTheme(themePreference);
      return;
    }
    setTheme(getSystemTheme());
    const media = window.matchMedia(THEME_DARK_MEDIA_QUERY);
    const handleThemeChange = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleThemeChange);
    return () => media.removeEventListener("change", handleThemeChange);
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemePreference((previous) => {
      const current = previous === "system" ? getSystemTheme() : previous;
      return current === "dark" ? "light" : "dark";
    });
  }, []);

  const resetThemePreference = useCallback(() => {
    setThemePreference("system");
  }, []);

  return { theme, toggleTheme, resetThemePreference };
}
