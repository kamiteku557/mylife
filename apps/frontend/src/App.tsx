import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface MemoLog {
  id: string;
  user_id: string;
  title: string;
  body_md: string;
  log_date: string;
  related_session_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface MemoInput {
  title: string;
  body_md: string;
  log_date: string;
  tags: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const EMPTY_MEMO: MemoInput = {
  title: "",
  body_md: "",
  log_date: new Date().toISOString().slice(0, 10),
  tags: "",
};

/** カンマ区切りのタグ文字列を、前後空白除去・重複排除したタグ名配列へ変換する。 */
function parseTagText(tagText: string): string[] {
  const unique = new Set<string>();
  return tagText
    .split(",")
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || unique.has(value)) {
        return false;
      }
      unique.add(value);
      return true;
    });
}

/** バックエンド API の JSON を取得し、非 2xx 応答を Error に正規化する。 */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

/** BL-006 対応範囲のメモログ CRUD 画面。 */
export function App() {
  const [memoLogs, setMemoLogs] = useState<MemoLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<MemoInput>(EMPTY_MEMO);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedMemo = useMemo(
    () => memoLogs.find((memo) => memo.id === selectedId) ?? null,
    [memoLogs, selectedId],
  );

  const refreshMemos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchJson<MemoLog[]>("/api/v1/memo-logs");
      setMemoLogs(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load memo logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMemos();
  }, [refreshMemos]);

  const startCreate = () => {
    setIsEditing(false);
    setSelectedId(null);
    setForm(EMPTY_MEMO);
  };

  const startEdit = (memo: MemoLog) => {
    setIsEditing(true);
    setSelectedId(memo.id);
    setForm({
      title: memo.title,
      body_md: memo.body_md,
      log_date: memo.log_date,
      tags: memo.tags.join(", "),
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.body_md.trim()) {
      setError("本文は必須です");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = {
        title: form.title,
        body_md: form.body_md,
        log_date: form.log_date,
        tags: parseTagText(form.tags),
        // BL-006 の暫定対応: セッション紐づけ UI は未実装のため null 固定。
        related_session_id: null,
      };

      if (isEditing && selectedId) {
        const updated = await fetchJson<MemoLog>(`/api/v1/memo-logs/${selectedId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMemoLogs((prev) => prev.map((item) => (item.id === selectedId ? updated : item)));
        setSelectedId(updated.id);
      } else {
        const created = await fetchJson<MemoLog>("/api/v1/memo-logs", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMemoLogs((prev) => [created, ...prev]);
        setSelectedId(created.id);
      }

      setIsEditing(false);
      setForm(EMPTY_MEMO);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (memoId: string) => {
    if (!window.confirm("このメモを削除しますか？")) {
      return;
    }
    setError("");
    try {
      await fetchJson<null>(`/api/v1/memo-logs/${memoId}`, { method: "DELETE" });
      setMemoLogs((prev) => prev.filter((item) => item.id !== memoId));
      if (selectedId === memoId) {
        setSelectedId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete");
    }
  };

  return (
    <main className="app">
      <header className="hero">
        <h1>Memo Log</h1>
        <p>Markdownメモを日付・タグ付きで記録します。</p>
      </header>

      <section className="workspace">
        <article className="card form-card">
          <div className="card-head">
            <h2>{isEditing ? "メモ編集" : "メモ作成"}</h2>
            <button type="button" className="ghost-btn" onClick={startCreate}>
              新規作成
            </button>
          </div>
          <form onSubmit={handleSubmit} className="memo-form">
            <label>
              タイトル
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label>
              日付
              <input
                type="date"
                value={form.log_date}
                onChange={(event) => setForm((prev) => ({ ...prev, log_date: event.target.value }))}
                required
              />
            </label>
            <label>
              タグ（カンマ区切り）
              <input
                value={form.tags}
                onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="work, idea"
              />
            </label>
            <label>
              本文 (Markdown)
              <textarea
                value={form.body_md}
                onChange={(event) => setForm((prev) => ({ ...prev, body_md: event.target.value }))}
                rows={10}
                required
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "保存中..." : isEditing ? "更新する" : "作成する"}
            </button>
          </form>
        </article>

        <article className="card list-card">
          <div className="card-head">
            <h2>メモ一覧</h2>
            <button type="button" className="ghost-btn" onClick={() => void refreshMemos()}>
              再読込
            </button>
          </div>
          {loading ? <p>読み込み中...</p> : null}
          {!loading && memoLogs.length === 0 ? <p>メモはまだありません。</p> : null}
          <ul className="memo-list">
            {memoLogs.map((memo) => (
              <li key={memo.id} className={memo.id === selectedId ? "selected" : ""}>
                <button
                  type="button"
                  className="memo-item"
                  onClick={() => setSelectedId(memo.id)}
                  title="詳細を表示"
                >
                  <strong>{memo.title || "(無題)"}</strong>
                  <span>{memo.log_date}</span>
                </button>
                <div className="row-actions">
                  <button type="button" className="ghost-btn" onClick={() => startEdit(memo)}>
                    編集
                  </button>
                  <button
                    type="button"
                    className="ghost-btn danger"
                    onClick={() => void handleDelete(memo.id)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card detail-card">
        <h2>メモ詳細</h2>
        {!selectedMemo ? <p>一覧からメモを選択してください。</p> : null}
        {selectedMemo ? (
          <>
            <h3>{selectedMemo.title || "(無題)"}</h3>
            <p className="meta">{selectedMemo.log_date}</p>
            <p className="meta">
              {selectedMemo.tags.length > 0 ? selectedMemo.tags.join(", ") : "タグなし"}
            </p>
            <pre>{selectedMemo.body_md}</pre>
          </>
        ) : null}
      </section>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
