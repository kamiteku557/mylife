import { useCallback, useEffect, useState } from "react";

export type ThemeName = "light" | "dark";
export type ThemePreference = ThemeName | "system";

const THEME_PREFERENCE_STORAGE_KEY = "mylife.theme-preference.v1";
const THEME_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** OSメディアクエリ結果をテーマ名へ変換する。 */
function mapMatchToTheme(matches: boolean): ThemeName {
  return matches ? "dark" : "light";
}

/** OS設定から現在のテーマを判定する。 */
function getSystemTheme(): ThemeName {
  if (typeof window === "undefined") {
    return "light";
  }
  return mapMatchToTheme(window.matchMedia(THEME_DARK_MEDIA_QUERY).matches);
}

/** 選択状態（system含む）を実際に適用するテーマへ解決する。 */
function resolveTheme(preference: ThemePreference): ThemeName {
  if (preference === "system") {
    return getSystemTheme();
  }
  return preference;
}

/** Light/Dark を相互に反転する。 */
function invertTheme(theme: ThemeName): ThemeName {
  return theme === "dark" ? "light" : "dark";
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
    return resolveTheme(loadThemePreference());
  });

  useEffect(() => {
    saveThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (themePreference !== "system") {
      setTheme(themePreference);
      return;
    }
    setTheme(resolveTheme(themePreference));
    const media = window.matchMedia(THEME_DARK_MEDIA_QUERY);
    const handleThemeChange = (event: MediaQueryListEvent) => {
      setTheme(mapMatchToTheme(event.matches));
    };
    media.addEventListener("change", handleThemeChange);
    return () => media.removeEventListener("change", handleThemeChange);
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemePreference((previous) => {
      return invertTheme(resolveTheme(previous));
    });
  }, []);

  const resetThemePreference = useCallback(() => {
    setThemePreference("system");
  }, []);

  return { theme, toggleTheme, resetThemePreference };
}
