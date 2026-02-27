import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";

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

interface MemoGroup {
  dateKey: string;
  label: string;
  memos: MemoLog[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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

/** メモ本文の先頭行から、バックエンド保存用タイトルを暫定生成する。 */
function inferTitleFromBody(body: string): string {
  const line = body
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  if (!line) {
    return "";
  }
  const withoutMarkdown = line.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s*/, "");
  return withoutMarkdown.slice(0, 80);
}

/** UI表示用の相対時刻を生成する。 */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  return "";
}

/** メモ行のヘッダ表示用日付を生成する。 */
function formatAbsoluteDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).format(new Date(iso));
}

/** タイムライン見出しの「Today/Yesterday/日付」ラベルを生成する。 */
function formatDateLabel(dateKey: string): string {
  const target = new Date(`${dateKey}T00:00:00`);
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  if (dateKey === todayKey) {
    return "Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  if (dateKey === yesterdayKey) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(target);
}

/** HTML特殊文字をエスケープする。 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 最低限のMarkdownを安全にHTMLへ変換する。 */
function renderMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown);
  const htmlWithBreak = escaped.replace(/\n/g, "<br />");
  return htmlWithBreak
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

/** APIレスポンスをJSONとして受け取り、失敗時をErrorへ正規化する。 */
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

/** メモ一覧を日付単位でグルーピングし、タイムライン描画用データへ変換する。 */
function groupMemoLogs(memoLogs: MemoLog[]): MemoGroup[] {
  const groups = new Map<string, MemoLog[]>();
  for (const memo of memoLogs) {
    const key = memo.log_date || memo.created_at.slice(0, 10);
    const items = groups.get(key);
    if (items) {
      items.push(memo);
      continue;
    }
    groups.set(key, [memo]);
  }
  return Array.from(groups.entries()).map(([dateKey, memos]) => ({
    dateKey,
    label: formatDateLabel(dateKey),
    memos,
  }));
}

/** BL-014 対応: メモログのデザイン準拠UI。 */
export function App() {
  const [memoLogs, setMemoLogs] = useState<MemoLog[]>([]);
  const [composerBody, setComposerBody] = useState("");
  const [composerTags, setComposerTags] = useState<string[]>([]);
  const [composerTagInput, setComposerTagInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const memoGroups = useMemo(() => groupMemoLogs(memoLogs), [memoLogs]);

  const refreshMemos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchJson<MemoLog[]>("/api/v1/memo-logs");
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setMemoLogs(list);
    } catch (eventualError) {
      setError(eventualError instanceof Error ? eventualError.message : "failed to load memo logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMemos();
  }, [refreshMemos]);

  /** コンポーザーのタグ入力欄から重複なしでタグを追加する。 */
  const addComposerTag = useCallback(() => {
    const nextTags = parseTagText(composerTagInput).filter((tag) => !composerTags.includes(tag));
    if (nextTags.length === 0) {
      return;
    }
    setComposerTags((prev) => [...prev, ...nextTags]);
    setComposerTagInput("");
  }, [composerTagInput, composerTags]);

  /** 編集フォームのタグ入力欄から重複なしでタグを追加する。 */
  const addEditTag = useCallback(() => {
    const nextTags = parseTagText(editTagInput).filter((tag) => !editTags.includes(tag));
    if (nextTags.length === 0) {
      return;
    }
    setEditTags((prev) => [...prev, ...nextTags]);
    setEditTagInput("");
  }, [editTagInput, editTags]);

  const startEditing = useCallback((memo: MemoLog) => {
    setEditingId(memo.id);
    setEditBody(memo.body_md);
    setEditTags([...memo.tags]);
    setEditTagInput("");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditBody("");
    setEditTags([]);
    setEditTagInput("");
  }, []);

  const handleComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }, []);

  const handleComposerTagKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addComposerTag();
      }
      if (event.key === "Backspace" && composerTagInput === "" && composerTags.length > 0) {
        setComposerTags((prev) => prev.slice(0, -1));
      }
    },
    [addComposerTag, composerTagInput, composerTags.length],
  );

  const handleEditTagKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addEditTag();
      }
      if (event.key === "Backspace" && editTagInput === "" && editTags.length > 0) {
        setEditTags((prev) => prev.slice(0, -1));
      }
    },
    [addEditTag, editTagInput, editTags.length],
  );

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!composerBody.trim()) {
        setError("本文は必須です");
        return;
      }

      setSubmitting(true);
      setError("");
      try {
        const payload = {
          title: inferTitleFromBody(composerBody),
          body_md: composerBody.trim(),
          log_date: new Date().toISOString().slice(0, 10),
          tags: composerTags,
          // BL-014 では既存仕様を維持し、関連セッションは未指定のまま送信する。
          related_session_id: null,
        };
        const created = await fetchJson<MemoLog>("/api/v1/memo-logs", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMemoLogs((prev) => [created, ...prev]);
        setComposerBody("");
        setComposerTags([]);
        setComposerTagInput("");
      } catch (eventualError) {
        setError(eventualError instanceof Error ? eventualError.message : "failed to save");
      } finally {
        setSubmitting(false);
      }
    },
    [composerBody, composerTags],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) {
      return;
    }
    if (!editBody.trim()) {
      setError("本文は必須です");
      return;
    }

    const source = memoLogs.find((memo) => memo.id === editingId);
    if (!source) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = {
        title: inferTitleFromBody(editBody),
        body_md: editBody.trim(),
        log_date: source.log_date,
        tags: editTags,
        related_session_id: source.related_session_id,
      };
      const updated = await fetchJson<MemoLog>(`/api/v1/memo-logs/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setMemoLogs((prev) => prev.map((memo) => (memo.id === editingId ? updated : memo)));
      cancelEditing();
    } catch (eventualError) {
      setError(eventualError instanceof Error ? eventualError.message : "failed to update");
    } finally {
      setSubmitting(false);
    }
  }, [cancelEditing, editBody, editTags, editingId, memoLogs]);

  const handleDelete = useCallback(
    async (memoId: string) => {
      if (!window.confirm("このメモを削除しますか？")) {
        return;
      }
      setError("");
      try {
        await fetchJson<null>(`/api/v1/memo-logs/${memoId}`, { method: "DELETE" });
        setMemoLogs((prev) => prev.filter((memo) => memo.id !== memoId));
        if (editingId === memoId) {
          cancelEditing();
        }
      } catch (eventualError) {
        setError(eventualError instanceof Error ? eventualError.message : "failed to delete");
      }
    },
    [cancelEditing, editingId],
  );

  return (
    <main className="memo-page">
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              ◌
            </span>
            <span className="brand-name">mylife</span>
          </div>
          <nav className="nav-tabs" aria-label="Main navigation">
            <span className="nav-tab active">Memo</span>
            <span className="nav-tab muted">Session</span>
          </nav>
          <button type="button" className="ghost-btn" onClick={() => void refreshMemos()}>
            再読込
          </button>
        </div>
      </header>

      <section className="content-wrap">
        <section className="composer-card" aria-label="Write a new memo">
          <form onSubmit={handleCreate}>
            <textarea
              value={composerBody}
              onChange={(event) => setComposerBody(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Write your memo... (Markdown supported)"
              className="composer-input"
              rows={6}
              required
            />

            <div className="tag-editor">
              {composerTags.map((tag) => (
                <span key={tag} className="tag-chip">
                  <span className="hash">#</span>
                  {tag}
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setComposerTags((prev) => prev.filter((item) => item !== tag))}
                    aria-label={`${tag} を削除`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="tag-input-wrap">
                <span className="plus" aria-hidden="true">
                  +
                </span>
                <input
                  value={composerTagInput}
                  onChange={(event) => setComposerTagInput(event.target.value)}
                  onKeyDown={handleComposerTagKeyDown}
                  onBlur={addComposerTag}
                  placeholder="Add tag..."
                  className="tag-input"
                />
              </span>
            </div>

            <div className="composer-footer">
              <p className="hint">
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd> で保存
              </p>
              <button
                type="submit"
                className="primary-btn"
                disabled={submitting || !composerBody.trim()}
              >
                {submitting ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </section>

        {error ? <p className="error-banner">{error}</p> : null}

        <section aria-label="Memo log">
          {loading ? <p className="loading">読み込み中...</p> : null}

          {!loading && memoLogs.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No memos yet</p>
              <p className="empty-note">Start writing above to create your first memo.</p>
            </div>
          ) : null}

          {!loading &&
            memoGroups.map((group) => (
              <div key={group.dateKey} className="day-group">
                <div className="day-header">
                  <span className="day-label">{group.label}</span>
                  <span className="day-summary">{group.memos.length} memos</span>
                </div>

                {group.memos.map((memo) => {
                  const isEditing = memo.id === editingId;
                  return (
                    <article key={memo.id} className="memo-card">
                      {isEditing ? (
                        <>
                          <textarea
                            className="edit-input"
                            value={editBody}
                            onChange={(event) => setEditBody(event.target.value)}
                            rows={5}
                          />

                          <div className="tag-editor">
                            {editTags.map((tag) => (
                              <span key={tag} className="tag-chip">
                                <span className="hash">#</span>
                                {tag}
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() =>
                                    setEditTags((prev) => prev.filter((item) => item !== tag))
                                  }
                                  aria-label={`${tag} を削除`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            <span className="tag-input-wrap">
                              <span className="plus" aria-hidden="true">
                                +
                              </span>
                              <input
                                value={editTagInput}
                                onChange={(event) => setEditTagInput(event.target.value)}
                                onKeyDown={handleEditTagKeyDown}
                                onBlur={addEditTag}
                                placeholder="Add tag..."
                                className="tag-input"
                              />
                            </span>
                          </div>

                          <div className="row-actions">
                            <button
                              type="button"
                              className="primary-btn"
                              disabled={submitting || !editBody.trim()}
                              onClick={() => void handleSaveEdit()}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="ghost-btn"
                              disabled={submitting}
                              onClick={cancelEditing}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className="memo-body"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(memo.body_md) }}
                          />

                          <div className="memo-footer">
                            <div className="memo-tags">
                              {memo.tags.map((tag) => (
                                <span key={tag} className="tag-chip outline">
                                  <span className="hash">#</span>
                                  {tag}
                                </span>
                              ))}
                            </div>

                            <div className="memo-meta">
                              <time
                                dateTime={memo.created_at}
                                title={formatAbsoluteDate(memo.created_at)}
                              >
                                {formatAbsoluteDate(memo.created_at)}
                              </time>
                              {formatRelativeTime(memo.created_at) ? (
                                <span>{` / ${formatRelativeTime(memo.created_at)}`}</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => startEditing(memo)}
                              disabled={submitting}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => void handleDelete(memo.id)}
                              disabled={submitting}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            ))}
        </section>
      </section>
    </main>
  );
}
