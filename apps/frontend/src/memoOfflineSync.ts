import {
  appendCreateQueueEntry,
  consumeCreateQueue,
  generateClientId,
  loadStoredList,
  saveStoredList,
  type KeyValueStorage,
  type OfflineCreateQueueEntry,
} from "./offlineSync/createQueue";

/**
 * 重要:
 * メモのオフライン同期フロー（enqueue/sync/replace）を変更した場合は、
 * `docs/offline-sync-flow.md` を同一コミットで更新すること。
 */

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

export interface MemoDraftFields {
  title: string;
  body_md: string;
  log_date: string;
  related_session_id: string | null;
  tags: string[];
}

export type MemoCreatePayload = MemoDraftFields;

export interface PendingMemoMeta {
  queued_at: string;
}

export interface PendingMemoQueueItem extends OfflineCreateQueueEntry<
  MemoCreatePayload,
  PendingMemoMeta
> {
  meta: PendingMemoMeta;
}

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

/** クライアント側の一時メモIDを生成する。 */
export function buildPendingPreviewId(clientId: string): string {
  return `local:${clientId}`;
}

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
export function buildPendingPreviewFromQueue(item: PendingMemoQueueItem): MemoLog {
  const queuedAt = item.meta.queued_at;
  return {
    id: buildPendingPreviewId(item.client_id),
    user_id: "local-pending",
    title: item.payload.title,
    body_md: item.payload.body_md,
    log_date: item.payload.log_date,
    related_session_id: item.payload.related_session_id,
    tags: [...item.payload.tags],
    created_at: queuedAt,
    updated_at: queuedAt,
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
    !!candidate.meta &&
    typeof candidate.meta.queued_at === "string"
  );
}

/** Pendingエントリに必要なmetaを必ず補完して返す。 */
function ensurePendingMeta(
  item: OfflineCreateQueueEntry<MemoCreatePayload, PendingMemoMeta>,
): PendingMemoQueueItem {
  return {
    ...item,
    meta: item.meta ?? {
      queued_at: new Date().toISOString(),
    },
  };
}

/** 旧形式(pendingにpreviewを持つ)から新形式へ正規化する。 */
function normalizePendingMemoQueueItem(value: unknown): PendingMemoQueueItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (isPendingMemoQueueItem(value)) {
    return value;
  }
  const legacy = value as {
    client_id?: unknown;
    payload?: unknown;
    preview?: { created_at?: unknown } | undefined;
  };
  if (
    typeof legacy.client_id !== "string" ||
    !legacy.payload ||
    typeof (legacy.payload as MemoCreatePayload).body_md !== "string"
  ) {
    return null;
  }
  return {
    client_id: legacy.client_id,
    payload: legacy.payload as MemoCreatePayload,
    meta: {
      queued_at:
        typeof legacy.preview?.created_at === "string"
          ? legacy.preview.created_at
          : new Date().toISOString(),
    },
  };
}

/** キャッシュ済みメモを読み込み、同期済み状態へ正規化する。 */
export function loadMemoCache(storage: KeyValueStorage): MemoLog[] {
  return sortMemosByCreatedAtDesc(
    loadStoredList(storage, MEMO_CACHE_STORAGE_KEY, isMemoLog).map(markSyncedMemo),
  );
}

/** 同期待ちキューを読み込む。 */
export function loadPendingMemoQueue(storage: KeyValueStorage): PendingMemoQueueItem[] {
  return loadStoredList(
    storage,
    MEMO_PENDING_QUEUE_STORAGE_KEY,
    (_value): _value is unknown => true,
  )
    .map((value) => normalizePendingMemoQueueItem(value))
    .filter((item): item is PendingMemoQueueItem => item !== null);
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
  // pendingをキャッシュへ混ぜると、次回起動時に「未確定データ」を確定表示してしまう。
  // そのためキャッシュ対象は同期済みデータに限定する。
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
  // 同期待ちキューを必ず「既存 + 新規」で作り直して保存する。
  // これにより、未送信分を失わず再起動後も再送できる。
  const queue = loadPendingMemoQueue(storage);
  const appended = appendCreateQueueEntry({
    queue,
    payload,
    clientId: generateClientId(),
    buildMeta: () => ({
      queued_at: new Date().toISOString(),
    }),
  });
  const nextQueue = appended.queue.map((item) => ensurePendingMeta(item));
  savePendingMemoQueue(storage, nextQueue);
  const queuedEntry = ensurePendingMeta(appended.entry);
  return {
    preview: buildPendingPreviewFromQueue(queuedEntry),
    queue: nextQueue,
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
  const remainingQueue = consumed.remaining.map((item) => ensurePendingMeta(item));
  // 失敗位置以降は残キューとして保存し、次回同期へ引き継ぐ。
  savePendingMemoQueue(params.storage, remainingQueue);

  return {
    successes: consumed.successes.map((result) => ({
      previewId: buildPendingPreviewId(result.entry.client_id),
      syncedMemo: markSyncedMemo(result.synced),
    })),
    pendingQueue: remainingQueue,
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
  // 置換対象のプレビュー(local:xxx)だけ除外し、成功分を確定データとして再挿入する。
  const kept = current.filter((memo) => !byPreviewId.has(memo.id));
  return sortMemosByCreatedAtDesc([...syncedAdds, ...kept]);
}
