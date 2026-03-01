import { describe, expect, it } from "vitest";
import {
  applyMemoSyncSuccesses,
  buildPendingPreviewFromQueue,
  enqueueMemoCreate,
  loadMemoCache,
  loadPendingMemoQueue,
  mergeMemoList,
  saveMemoCache,
  syncPendingMemoCreates,
  type MemoLog,
} from "./memoOfflineSync";
import type { KeyValueStorage } from "./offlineSync/createQueue";

class MemoryStorage implements KeyValueStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function buildMemo(overrides?: Partial<MemoLog>): MemoLog {
  return {
    id: "m1",
    user_id: "u1",
    title: "memo",
    body_md: "body",
    log_date: "2026-03-01",
    related_session_id: null,
    tags: [],
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    sync_status: "synced",
    ...overrides,
  };
}

describe("memoOfflineSync", () => {
  it("saveMemoCache/loadMemoCache: pending memo is excluded from cache", () => {
    const storage = new MemoryStorage();
    saveMemoCache(storage, [
      buildMemo({ id: "synced-1", sync_status: "synced" }),
      buildMemo({ id: "pending-1", sync_status: "pending" }),
    ]);
    const loaded = loadMemoCache(storage);
    expect(loaded.map((item) => item.id)).toEqual(["synced-1"]);
    expect(loaded[0]?.sync_status).toBe("synced");
  });

  it("enqueueMemoCreate: creates local preview and persists queue", () => {
    const storage = new MemoryStorage();
    const result = enqueueMemoCreate(storage, {
      title: "t",
      body_md: "b",
      log_date: "2026-03-01",
      related_session_id: null,
      tags: ["x"],
    });
    expect(result.preview.id.startsWith("local:")).toBe(true);
    expect(result.preview.sync_status).toBe("pending");
    expect(result.queue).toHaveLength(1);
    const loadedQueue = loadPendingMemoQueue(storage);
    expect(loadedQueue).toHaveLength(1);
    expect(loadedQueue[0]?.meta?.queued_at).toBeTypeOf("string");
  });

  it("loadPendingMemoQueue: legacy queue(with preview) is normalized", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mylife.memo-pending-create.v1",
      JSON.stringify([
        {
          client_id: "legacy-1",
          payload: {
            title: "t",
            body_md: "b",
            log_date: "2026-03-01",
            related_session_id: null,
            tags: [],
          },
          preview: {
            id: "local:legacy-1",
            user_id: "local-pending",
            title: "t",
            body_md: "b",
            log_date: "2026-03-01",
            related_session_id: null,
            tags: [],
            created_at: "2026-03-01T02:00:00.000Z",
            updated_at: "2026-03-01T02:00:00.000Z",
            sync_status: "pending",
          },
        },
      ]),
    );
    const loaded = loadPendingMemoQueue(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.client_id).toBe("legacy-1");
    expect(loaded[0]?.meta?.queued_at).toBe("2026-03-01T02:00:00.000Z");
  });

  it("buildPendingPreviewFromQueue: builds preview from payload and queued_at", () => {
    const preview = buildPendingPreviewFromQueue({
      client_id: "q1",
      payload: {
        title: "x",
        body_md: "hello",
        log_date: "2026-03-01",
        related_session_id: null,
        tags: ["t"],
      },
      meta: {
        queued_at: "2026-03-01T03:00:00.000Z",
      },
    });
    expect(preview.id).toBe("local:q1");
    expect(preview.created_at).toBe("2026-03-01T03:00:00.000Z");
    expect(preview.body_md).toBe("hello");
  });

  it("mergeMemoList: keeps pending preview and synced server memos", () => {
    const merged = mergeMemoList(
      [buildMemo({ id: "server-1", created_at: "2026-03-01T01:00:00.000Z" })],
      [
        buildMemo({
          id: "local:x",
          created_at: "2026-03-01T02:00:00.000Z",
          sync_status: "pending",
        }),
      ],
    );
    expect(merged.map((item) => item.id)).toEqual(["local:x", "server-1"]);
    expect(merged[0]?.sync_status).toBe("pending");
  });

  it("applyMemoSyncSuccesses: replaces preview with synced memo", () => {
    const replaced = applyMemoSyncSuccesses(
      [
        buildMemo({ id: "local:p1", sync_status: "pending" }),
        buildMemo({ id: "server-old", sync_status: "synced" }),
      ],
      [
        {
          previewId: "local:p1",
          syncedMemo: buildMemo({ id: "server-new", sync_status: "synced" }),
        },
      ],
    );
    expect(replaced.find((memo) => memo.id === "local:p1")).toBeUndefined();
    expect(replaced.find((memo) => memo.id === "server-new")?.sync_status).toBe("synced");
  });

  it("syncPendingMemoCreates: successful sync clears queue", async () => {
    const storage = new MemoryStorage();
    enqueueMemoCreate(storage, {
      title: "t1",
      body_md: "b1",
      log_date: "2026-03-01",
      related_session_id: null,
      tags: [],
    });
    const result = await syncPendingMemoCreates({
      storage,
      createRemote: async () => buildMemo({ id: "server-1" }),
    });
    expect(result.error).toBeNull();
    expect(result.successes).toHaveLength(1);
    expect(result.pendingQueue).toHaveLength(0);
    expect(loadPendingMemoQueue(storage)).toHaveLength(0);
  });

  it("syncPendingMemoCreates: failure keeps queue for retry", async () => {
    const storage = new MemoryStorage();
    enqueueMemoCreate(storage, {
      title: "t1",
      body_md: "b1",
      log_date: "2026-03-01",
      related_session_id: null,
      tags: [],
    });
    const result = await syncPendingMemoCreates({
      storage,
      createRemote: async () => {
        throw new Error("network");
      },
    });
    expect(result.error?.message).toBe("network");
    expect(result.pendingQueue).toHaveLength(1);
    expect(loadPendingMemoQueue(storage)).toHaveLength(1);
  });
});
