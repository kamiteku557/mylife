import { describe, expect, it } from "vitest";
import {
  appendCreateQueueEntry,
  consumeCreateQueue,
  loadStoredList,
  saveStoredList,
  type KeyValueStorage,
} from "./createQueue";

class MemoryStorage implements KeyValueStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("offlineSync/createQueue", () => {
  it("loadStoredList: missing key then empty array", () => {
    const storage = new MemoryStorage();
    const loaded = loadStoredList(
      storage,
      "missing",
      (value): value is number => typeof value === "number",
    );
    expect(loaded).toEqual([]);
  });

  it("loadStoredList: invalid JSON then empty array", () => {
    const storage = new MemoryStorage();
    storage.setItem("broken", "{");
    const loaded = loadStoredList(
      storage,
      "broken",
      (value): value is number => typeof value === "number",
    );
    expect(loaded).toEqual([]);
  });

  it("loadStoredList: filters invalid items by guard", () => {
    const storage = new MemoryStorage();
    saveStoredList(storage, "items", [1, "x", 2] as unknown[]);
    const loaded = loadStoredList(
      storage,
      "items",
      (value): value is number => typeof value === "number",
    );
    expect(loaded).toEqual([1, 2]);
  });

  it("appendCreateQueueEntry: appends queue with preview", () => {
    const result = appendCreateQueueEntry({
      queue: [],
      payload: { text: "hello" },
      clientId: "fixed",
      buildPreview: (payload, clientId) => ({ id: `local:${clientId}`, text: payload.text }),
    });
    expect(result.entry.client_id).toBe("fixed");
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].preview).toEqual({ id: "local:fixed", text: "hello" });
  });

  it("consumeCreateQueue: success drains queue in order", async () => {
    const queue = [
      { client_id: "c1", payload: { value: 1 }, preview: { id: "p1" } },
      { client_id: "c2", payload: { value: 2 }, preview: { id: "p2" } },
    ];
    const seen: number[] = [];
    const result = await consumeCreateQueue({
      queue,
      createRemote: async (payload: { value: number }) => {
        seen.push(payload.value);
        return { id: `s${payload.value}` };
      },
    });
    expect(seen).toEqual([1, 2]);
    expect(result.error).toBeNull();
    expect(result.remaining).toEqual([]);
    expect(result.successes.map((item) => item.synced.id)).toEqual(["s1", "s2"]);
  });

  it("consumeCreateQueue: failure keeps failed and remaining entries", async () => {
    const queue = [
      { client_id: "c1", payload: { value: 1 }, preview: { id: "p1" } },
      { client_id: "c2", payload: { value: 2 }, preview: { id: "p2" } },
      { client_id: "c3", payload: { value: 3 }, preview: { id: "p3" } },
    ];
    const result = await consumeCreateQueue({
      queue,
      createRemote: async (payload: { value: number }) => {
        if (payload.value === 2) {
          throw new Error("boom");
        }
        return { id: `s${payload.value}` };
      },
    });
    expect(result.error?.message).toBe("boom");
    expect(result.successes.map((item) => item.entry.client_id)).toEqual(["c1"]);
    expect(result.remaining.map((item) => item.client_id)).toEqual(["c2", "c3"]);
  });
});
