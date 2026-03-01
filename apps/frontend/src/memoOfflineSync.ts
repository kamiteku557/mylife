import {
  appendCreateQueueEntry,
  consumeCreateQueue,
  loadStoredList,
  saveStoredList,
  type KeyValueStorage,
  type OfflineCreateQueueEntry,
} from "./offlineSync/createQueue";

export type MemoSyncStatus = "synced" | "pending";

export interface MemoLog {
  id: string;
  user_id: string;
  title: string;
  body_md: string;
  log_date: string;
  related_session_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  sync_status?: MemoSyncStatus;
}

export interface MemoCreatePayload {
  title: string;
  body_md: string;
  log_date: string;
  related_session_id: string | null;
  tags: string[];
}

export type PendingMemoQueueItem = OfflineCreateQueueEntry<MemoCreatePayload, MemoLog>;

export interface MemoSyncSuccess {
  previewId: string;
  syncedMemo: MemoLog;
}

export interface MemoSyncResult {
  successes: MemoSyncSuccess[];
  pendingQueue: PendingMemoQueueItem[];
  error: Error | null;
}

export const MEMO_CACHE_STORAGE_KEY = "mylife.memo-cache.v1";
export const MEMO_PENDING_QUEUE_STORAGE_KEY = "mylife.memo-pending-create.v1";

/** メモ配列を作成日時の降順へ揃える。 */
export function sortMemosByCreatedAtDesc(memos: MemoLog[]): MemoLog[] {
  return [...memos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** 同期済み状態のメモへ正規化する。 */
export function markSyncedMemo(memo: MemoLog): MemoLog {
  return { ...memo, sync_status: "synced" };
}

/** ローカルプレビュー用の同期待ちメモを生成する。 */
export function buildPendingPreview(payload: MemoCreatePayload, clientId: string): MemoLog {
  const now = new Date().toISOString();
  return {
    id: `local:${clientId}`,
    user_id: "local-pending",
    title: payload.title,
    body_md: payload.body_md,
    log_date: payload.log_date,
    related_session_id: payload.related_session_id,
    tags: [...payload.tags],
    created_at: now,
    updated_at: now,
    sync_status: "pending",
  };
}

/** JSON由来の値を MemoLog として扱えるか判定する。 */
export function isMemoLog(value: unknown): value is MemoLog {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<MemoLog>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.body_md === "string" &&
    typeof candidate.created_at === "string" &&
    Array.isArray(candidate.tags)
  );
}

/** JSON由来の値を同期待ちキュー要素として扱えるか判定する。 */
export function isPendingMemoQueueItem(value: unknown): value is PendingMemoQueueItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<PendingMemoQueueItem>;
  return (
    typeof candidate.client_id === "string" &&
    !!candidate.payload &&
    typeof candidate.payload.body_md === "string" &&
    isMemoLog(candidate.preview)
  );
}

/** キャッシュ済みメモを読み込み、同期済み状態へ正規化する。 */
export function loadMemoCache(storage: KeyValueStorage): MemoLog[] {
  return sortMemosByCreatedAtDesc(
    loadStoredList(storage, MEMO_CACHE_STORAGE_KEY, isMemoLog).map(markSyncedMemo),
  );
}

/** 同期待ちキューを読み込む。 */
export function loadPendingMemoQueue(storage: KeyValueStorage): PendingMemoQueueItem[] {
  return loadStoredList(storage, MEMO_PENDING_QUEUE_STORAGE_KEY, isPendingMemoQueueItem);
}

/** 同期待ちキューを保存する。 */
export function savePendingMemoQueue(
  storage: KeyValueStorage,
  queue: PendingMemoQueueItem[],
): void {
  saveStoredList(storage, MEMO_PENDING_QUEUE_STORAGE_KEY, queue);
}

/** メモキャッシュを保存する。 */
export function saveMemoCache(storage: KeyValueStorage, memos: MemoLog[]): void {
  const syncedOnly = memos
    .filter((memo) => memo.sync_status !== "pending")
    .map((memo) => ({ ...memo, sync_status: undefined }));
  saveStoredList(storage, MEMO_CACHE_STORAGE_KEY, syncedOnly);
}

/** サーバーメモと同期待ちメモを合成して表示リストを作る。 */
export function mergeMemoList(serverMemos: MemoLog[], pendingPreviews: MemoLog[]): MemoLog[] {
  const merged = new Map<string, MemoLog>();
  for (const memo of serverMemos) {
    merged.set(memo.id, markSyncedMemo(memo));
  }
  for (const memo of pendingPreviews) {
    if (!merged.has(memo.id)) {
      merged.set(memo.id, { ...memo, sync_status: "pending" });
    }
  }
  return sortMemosByCreatedAtDesc([...merged.values()]);
}

/** 新規メモを同期待ちキューへ追加し、表示用プレビューを返す。 */
export function enqueueMemoCreate(
  storage: KeyValueStorage,
  payload: MemoCreatePayload,
): {
  preview: MemoLog;
  queue: PendingMemoQueueItem[];
} {
  const queue = loadPendingMemoQueue(storage);
  const appended = appendCreateQueueEntry({
    queue,
    payload,
    buildPreview: buildPendingPreview,
  });
  savePendingMemoQueue(storage, appended.queue);
  return {
    preview: appended.entry.preview,
    queue: appended.queue,
  };
}

/** 同期待ちメモを送信し、成功分の置換情報と残キューを返す。 */
export async function syncPendingMemoCreates(params: {
  storage: KeyValueStorage;
  createRemote: (payload: MemoCreatePayload) => Promise<MemoLog>;
}): Promise<MemoSyncResult> {
  const queue = loadPendingMemoQueue(params.storage);
  if (queue.length === 0) {
    return {
      successes: [],
      pendingQueue: [],
      error: null,
    };
  }

  const consumed = await consumeCreateQueue({
    queue,
    createRemote: params.createRemote,
  });
  savePendingMemoQueue(params.storage, consumed.remaining);

  return {
    successes: consumed.successes.map((result) => ({
      previewId: result.entry.preview.id,
      syncedMemo: markSyncedMemo(result.synced),
    })),
    pendingQueue: consumed.remaining,
    error: consumed.error,
  };
}

/** 成功した同期結果を現在表示へ適用し、プレビューを確定データへ置換する。 */
export function applyMemoSyncSuccesses(
  current: MemoLog[],
  successes: MemoSyncSuccess[],
): MemoLog[] {
  if (successes.length === 0) {
    return current;
  }
  const byPreviewId = new Map(successes.map((result) => [result.previewId, result.syncedMemo]));
  const syncedAdds = successes.map((result) => result.syncedMemo);
  const kept = current.filter((memo) => !byPreviewId.has(memo.id));
  return sortMemosByCreatedAtDesc([...syncedAdds, ...kept]);
}
