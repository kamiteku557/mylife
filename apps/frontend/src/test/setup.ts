import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const storageData = new Map<string, string>();

const memoryStorage = {
  getItem(key: string) {
    return storageData.has(key) ? storageData.get(key)! : null;
  },
  setItem(key: string, value: string) {
    storageData.set(key, String(value));
  },
  removeItem(key: string) {
    storageData.delete(key);
  },
  clear() {
    storageData.clear();
  },
};

Object.defineProperty(window, "localStorage", {
  value: memoryStorage,
  configurable: true,
});
Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage,
  configurable: true,
});
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
});
