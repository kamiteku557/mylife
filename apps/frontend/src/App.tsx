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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/** カンマ区切りテキストを重複なしタグ配列へ変換する。 */
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

/** 本文の先頭有効行を、保存用タイトルとして切り出す。 */
function inferTitleFromBody(body: string): string {
  const line = body
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  if (!line) {
    return "";
  }
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s*/, "")
    .slice(0, 80);
}

/** XSS回避のためにHTML特殊文字をエスケープする。 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 一行分のMarkdown装飾（リンク・強調・コード）をHTML化する。 */
function renderInlineMarkdown(line: string): string {
  const escaped = escapeHtml(line);
  return escaped
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** 最低限のMarkdownをモック相当の表示に変換する。 */
function renderMarkdown(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return "";
  }

  const blocks = trimmed.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const first = lines[0] ?? "";

      if (/^###\s+/.test(first)) {
        return `<h3>${renderInlineMarkdown(first.replace(/^###\s+/, ""))}</h3>`;
      }
      if (/^##\s+/.test(first)) {
        return `<h2>${renderInlineMarkdown(first.replace(/^##\s+/, ""))}</h2>`;
      }
      if (/^#\s+/.test(first)) {
        return `<h1>${renderInlineMarkdown(first.replace(/^#\s+/, ""))}</h1>`;
      }
      if (lines.every((line) => line.startsWith("- "))) {
        const items = lines
          .map((line) => `<li>${renderInlineMarkdown(line.replace(/^-\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (lines.every((line) => line.startsWith("> "))) {
        const body = lines
          .map((line) => renderInlineMarkdown(line.replace(/^>\s+/, "")))
          .join("<br />");
        return `<blockquote>${body}</blockquote>`;
      }
      return `<p>${lines.map((line) => renderInlineMarkdown(line)).join("<br />")}</p>`;
    })
    .join("");
}

/** メモ表示用の絶対時刻を生成する。 */
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

/** メモ表示用の相対時刻を生成する。 */
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

/** API JSON取得時に非2xxをErrorへ正規化する。 */
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

/** BL-014: v0モック準拠のメモログUI。 */
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

  const addComposerTag = useCallback(() => {
    const tags = parseTagText(composerTagInput).filter((tag) => !composerTags.includes(tag));
    if (tags.length === 0) {
      return;
    }
    setComposerTags((prev) => [...prev, ...tags]);
    setComposerTagInput("");
  }, [composerTagInput, composerTags]);

  const addEditTag = useCallback(() => {
    const tags = parseTagText(editTagInput).filter((tag) => !editTags.includes(tag));
    if (tags.length === 0) {
      return;
    }
    setEditTags((prev) => [...prev, ...tags]);
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

  const handleComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }, []);

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
          // セッション紐づけUIは未提供のため、現時点はnull固定で送信する。
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

  const renderedMemos = useMemo(
    () =>
      memoLogs.map((memo) => ({
        ...memo,
        renderedBody: renderMarkdown(memo.body_md),
        absoluteDate: formatAbsoluteDate(memo.created_at),
        relativeDate: formatRelativeTime(memo.created_at),
      })),
    [memoLogs],
  );

  return (
    <div className="page-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand-wrap">
            <svg className="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 6v13M3 5.5A2.5 2.5 0 0 1 5.5 3H12v16H5.5A2.5 2.5 0 0 0 3 21.5z" />
              <path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H12v16h6.5a2.5 2.5 0 0 1 2.5 2.5z" />
            </svg>
            <span className="brand-text">mylife</span>
          </div>

          <nav className="menu-tabs" aria-label="Main navigation">
            <span className="menu-tab active">Memo</span>
            <span className="menu-tab">Session</span>
          </nav>

          <button type="button" className="refresh-btn" onClick={() => void refreshMemos()}>
            再読込
          </button>
        </div>
      </header>

      <main className="content">
        <section className="composer" aria-label="Write a new memo">
          <form onSubmit={handleCreate}>
            <textarea
              value={composerBody}
              onChange={(event) => setComposerBody(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              className="composer-textarea"
              placeholder="Write your memo... (Markdown supported)"
              rows={7}
              required
            />

            <div className="composer-tags">
              {composerTags.map((tag) => (
                <span key={tag} className="tag-pill">
                  <span className="tag-mark">#</span>
                  {tag}
                  <button
                    type="button"
                    className="tag-remove"
                    onClick={() => setComposerTags((prev) => prev.filter((item) => item !== tag))}
                    aria-label={`${tag} を削除`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="tag-input-wrap">
                <span className="tag-plus" aria-hidden="true">
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
              <p className="composer-hint">
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save
              </p>
              <button
                type="submit"
                className="save-btn"
                disabled={submitting || !composerBody.trim()}
              >
                <svg viewBox="0 0 24 24" className="save-icon" aria-hidden="true">
                  <path d="m3 11 18-8-8 18-2.5-7.5z" />
                  <path d="M10.5 13.5 21 3" />
                </svg>
                Save
              </button>
            </div>
          </form>
        </section>

        {error ? <p className="error-banner">{error}</p> : null}

        {loading ? <p className="status-text">Loading...</p> : null}

        {!loading && renderedMemos.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No memos yet</p>
            <p className="empty-note">Start writing above to create your first memo.</p>
          </div>
        ) : null}

        <section aria-label="Memo log" className="timeline">
          {renderedMemos.map((memo) => {
            const isEditing = editingId === memo.id;
            return (
              <article key={memo.id} className="memo-row">
                {isEditing ? (
                  <>
                    <textarea
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      rows={6}
                      className="edit-textarea"
                    />

                    <div className="composer-tags">
                      {editTags.map((tag) => (
                        <span key={tag} className="tag-pill">
                          <span className="tag-mark">#</span>
                          {tag}
                          <button
                            type="button"
                            className="tag-remove"
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
                        <span className="tag-plus" aria-hidden="true">
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

                    <div className="edit-actions">
                      <button
                        type="button"
                        className="save-btn"
                        onClick={() => void handleSaveEdit()}
                      >
                        Save
                      </button>
                      <button type="button" className="row-icon-btn" onClick={cancelEditing}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="row-toolbar">
                      <button
                        type="button"
                        className="row-icon-btn"
                        onClick={() => startEditing(memo)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 17.25V21h3.75L19.8 7.95 16.05 4.2z" />
                          <path d="m14.5 5.75 3.75 3.75" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="row-icon-btn"
                        onClick={() => void handleDelete(memo.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M6 7l1 13h10l1-13" />
                          <path d="M9 7V4h6v3" />
                        </svg>
                      </button>
                    </div>

                    <div
                      className="memo-content"
                      dangerouslySetInnerHTML={{ __html: memo.renderedBody }}
                    />

                    <div className="memo-footer">
                      <div className="memo-tags">
                        {memo.tags.map((tag) => (
                          <span key={tag} className="tag-pill outline">
                            <span className="tag-mark">#</span>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="memo-date">
                        <time dateTime={memo.created_at}>{memo.absoluteDate}</time>
                        {memo.relativeDate ? <span>{` / ${memo.relativeDate}`}</span> : null}
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
