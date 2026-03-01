export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 重要:
 * このファイルの同期待ちキュー処理を修正した場合は、
 * `docs/offline-sync-flow.md` を同一コミットで更新すること。
 */

export interface OfflineCreateQueueEntry<TPayload, TPreview> {
  client_id: string;
  payload: TPayload;
  preview: TPreview;
}

export interface QueueConsumeSuccess<TPayload, TPreview, TSynced> {
  entry: OfflineCreateQueueEntry<TPayload, TPreview>;
  synced: TSynced;
}

export interface QueueConsumeResult<TPayload, TPreview, TSynced> {
  successes: QueueConsumeSuccess<TPayload, TPreview, TSynced>[];
  remaining: OfflineCreateQueueEntry<TPayload, TPreview>[];
  error: Error | null;
}

/** JSON文字列を安全に配列へ変換し、型ガードで不正要素を除外する。 */
export function loadStoredList<T>(
  storage: KeyValueStorage,
  key: string,
  isValid: (value: unknown) => value is T,
): T[] {
  const raw = storage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

/** 配列データをJSONとして保存する。 */
export function saveStoredList<T>(storage: KeyValueStorage, key: string, values: T[]): void {
  storage.setItem(key, JSON.stringify(values));
}

/** ローカル同期待ちキュー用のクライアントIDを生成する。 */
export function generateClientId(now: () => number = Date.now): string {
  return `${now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 作成系キューへエントリを1件追加する。 */
export function appendCreateQueueEntry<TPayload, TPreview>(params: {
  queue: OfflineCreateQueueEntry<TPayload, TPreview>[];
  payload: TPayload;
  clientId?: string;
  buildPreview: (payload: TPayload, clientId: string) => TPreview;
}): {
  entry: OfflineCreateQueueEntry<TPayload, TPreview>;
  queue: OfflineCreateQueueEntry<TPayload, TPreview>[];
} {
  const clientId = params.clientId ?? generateClientId();
  const entry = {
    client_id: clientId,
    payload: params.payload,
    preview: params.buildPreview(params.payload, clientId),
  };
  return {
    entry,
    queue: [...params.queue, entry],
  };
}

/**
 * 作成系キューを先頭から順に送信する。
 * 失敗時はその時点で停止し、失敗エントリ以降を remaining として返す。
 */
export async function consumeCreateQueue<TPayload, TPreview, TSynced>(params: {
  queue: OfflineCreateQueueEntry<TPayload, TPreview>[];
  createRemote: (payload: TPayload) => Promise<TSynced>;
}): Promise<QueueConsumeResult<TPayload, TPreview, TSynced>> {
  const successes: QueueConsumeSuccess<TPayload, TPreview, TSynced>[] = [];
  for (let index = 0; index < params.queue.length; index += 1) {
    const entry = params.queue[index];
    try {
      // 送信順序を固定し、先に積まれた作業を先に確定させる。
      const synced = await params.createRemote(entry.payload);
      successes.push({ entry, synced });
    } catch (eventualError) {
      const error = eventualError instanceof Error ? eventualError : new Error("queue sync failed");
      // 失敗エントリ以降は未送信として返す。再試行時の再現性を優先する。
      return {
        successes,
        remaining: params.queue.slice(index),
        error,
      };
    }
  }
  return {
    successes,
    remaining: [],
    error: null,
  };
}
