import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";

const THEME_PREFERENCE_STORAGE_KEY = "mylife.theme-preference.v1";

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => false,
      addListener: () => undefined,
      removeListener: () => undefined,
    })),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent));
    },
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_PREFERENCE_STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
  });

  it("保存済み設定がある場合はそのテーマを復元する", async () => {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, "dark");
    mockMatchMedia(false);

    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("system 設定時は OS のテーマ変更に追従する", async () => {
    const media = mockMatchMedia(false);

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    act(() => {
      media.setMatches(true);
    });

    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("toggleTheme と resetThemePreference で手動上書きを制御できる", async () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
      expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe("dark");
    });

    act(() => {
      result.current.resetThemePreference();
    });

    await waitFor(() => {
      expect(result.current.theme).toBe("light");
      expect(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe("system");
    });
  });
});
