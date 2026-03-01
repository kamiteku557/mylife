import {
  FormEvent,
  KeyboardEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyMemoSyncSuccesses,
  buildPendingPreviewFromQueue,
  buildPendingPreviewId,
  enqueueMemoCreate,
  loadMemoCache,
  loadPendingMemoQueue,
  markSyncedMemo,
  mergeMemoList,
  saveMemoCache,
  savePendingMemoQueue,
  syncPendingMemoCreates,
  type MemoCreatePayload,
  type MemoLog,
} from "./memoOfflineSync";
import { SessionView } from "./SessionView";
import { useTheme } from "./useTheme";

/**
 * 重要:
 * `runInitialSync` / `refreshMemos` / `syncPendingMemos` の順序や責務を変更した場合は、
 * `docs/offline-sync-flow.md` も同一コミットで更新すること。
 */

interface AppSettings {
  memoDisplayCount: number;
  memoFontSizePx: number;
}

interface PomodoroSettings {
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const API_BASE_URL_ERROR =
  API_BASE_URL.length > 0
    ? ""
    : "VITE_API_BASE_URL is not configured. Set frontend environment variable to backend URL.";
const SETTINGS_STORAGE_KEY = "mylife.settings.v1";
const DEFAULT_MEMO_DISPLAY_COUNT = 20;
const DEFAULT_MEMO_FONT_SIZE_PX = 18;
const MIN_MEMO_DISPLAY_COUNT = 5;
const MAX_MEMO_DISPLAY_COUNT = 100;
const MIN_MEMO_FONT_SIZE_PX = 14;
const MAX_MEMO_FONT_SIZE_PX = 32;
const MEMO_FONT_SIZE_CSS_VAR = "--memo-font-size" as const;

/** 設定値を最小/最大の範囲に丸める。 */
function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

/** 設定の初期値を返す。 */
function getDefaultSettings(): AppSettings {
  return {
    memoDisplayCount: DEFAULT_MEMO_DISPLAY_COUNT,
    memoFontSizePx: DEFAULT_MEMO_FONT_SIZE_PX,
  };
}

/** ローカル保存された設定を読み込み、欠損時は初期値を返す。 */
function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return getDefaultSettings();
  }
  const fallback = getDefaultSettings();
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      memoDisplayCount: clampInt(
        parsed.memoDisplayCount ?? fallback.memoDisplayCount,
        MIN_MEMO_DISPLAY_COUNT,
        MAX_MEMO_DISPLAY_COUNT,
      ),
      memoFontSizePx: clampInt(
        parsed.memoFontSizePx ?? fallback.memoFontSizePx,
        MIN_MEMO_FONT_SIZE_PX,
        MAX_MEMO_FONT_SIZE_PX,
      ),
    };
  } catch {
    return fallback;
  }
}

/** 設定をローカルへ永続化する。 */
function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

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
  if (!API_BASE_URL) {
    throw new Error(API_BASE_URL_ERROR);
  }

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

/** BL-014, BL-017: メモログUIと設定UI。 */
export function App() {
  const [memoLogs, setMemoLogs] = useState<MemoLog[]>([]);
  const [activeView, setActiveView] = useState<"memo" | "session" | "settings">("memo");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const { theme, toggleTheme, resetThemePreference } = useTheme();
  const [composerBody, setComposerBody] = useState("");
  const [composerTags, setComposerTags] = useState<string[]>([]);
  const [composerTagInput, setComposerTagInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncingMemos, setSyncingMemos] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [pomodoroSettings, setPomodoroSettings] = useState<PomodoroSettings | null>(null);
  const [pomodoroSettingsDraft, setPomodoroSettingsDraft] = useState<PomodoroSettings | null>(null);
  const [pomodoroSettingsSaving, setPomodoroSettingsSaving] = useState(false);
  const hasApiConfigError = API_BASE_URL_ERROR.length > 0;
  const pendingSyncInFlightRef = useRef(false);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    // 画面状態のうち「同期済みメモのみ」をキャッシュ化し、次回起動の初速を上げる。
    saveMemoCache(window.localStorage, memoLogs);
  }, [memoLogs]);

  useEffect(() => {
    if (hasApiConfigError) {
      return;
    }
    // 起動直後の待ち時間を減らすため、先にローカルキャッシュを表示する。
    // ここではネットワーク完了を待たず、表示可能なデータを即描画する。
    const cached = loadMemoCache(window.localStorage);
    const pendingQueue = loadPendingMemoQueue(window.localStorage);
    const pendingPreviews = pendingQueue.map((item) => buildPendingPreviewFromQueue(item));
    const merged = mergeMemoList(cached, pendingPreviews);
    if (merged.length > 0) {
      setMemoLogs(merged);
      setLoading(false);
    }
    setPendingSyncCount(pendingQueue.length);
  }, [hasApiConfigError]);

  const syncPendingMemos = useCallback(async () => {
    if (hasApiConfigError || pendingSyncInFlightRef.current) {
      return;
    }
    // 同時多重送信を防ぐ。二重送信は重複作成の原因になるため逐次1本に制限する。
    pendingSyncInFlightRef.current = true;
    setSyncingMemos(true);
    try {
      // localStorageの同期待ちキューを順番にPOSTし、成功分は置換情報として受け取る。
      const synced = await syncPendingMemoCreates({
        storage: window.localStorage,
        createRemote: async (payload) =>
          fetchJson<MemoLog>("/api/v1/memo-logs", {
            method: "POST",
            body: JSON.stringify(payload),
          }),
      });
      setPendingSyncCount(synced.pendingQueue.length);
      if (synced.successes.length > 0) {
        // local:xxx の仮メモを、サーバー確定のメモIDへ差し替える。
        setMemoLogs((prev) => applyMemoSyncSuccesses(prev, synced.successes));
      }
      if (synced.error) {
        setError(`同期待ちメモの送信に失敗しました: ${synced.error.message}`);
      }
    } finally {
      pendingSyncInFlightRef.current = false;
      setSyncingMemos(false);
      setLoading(false);
    }
  }, [hasApiConfigError]);
  const refreshMemos = useCallback(async () => {
    if (hasApiConfigError) {
      // 設定不足時は通信を試行せず、原因を画面に明示する。
      setLoading(false);
      setError(API_BASE_URL_ERROR);
      return;
    }

    setSyncingMemos(true);
    setError("");
    try {
      const query = new URLSearchParams({
        limit: String(settings.memoDisplayCount),
      });
      const list = await fetchJson<MemoLog[]>(`/api/v1/memo-logs?${query.toString()}`);
      const synced = list.map((item) => markSyncedMemo(item));
      const pendingQueue = loadPendingMemoQueue(window.localStorage);
      const pendingPreviews = pendingQueue.map((item) => buildPendingPreviewFromQueue(item));
      setPendingSyncCount(pendingQueue.length);
      // サーバー最新 + 同期待ちプレビューを合成し、整合を保ちながら表示する。
      setMemoLogs(mergeMemoList(synced, pendingPreviews));
      // 次回の高速表示用に、サーバー確定データをキャッシュする。
      saveMemoCache(window.localStorage, synced);
    } catch (eventualError) {
      setError(eventualError instanceof Error ? eventualError.message : "failed to load memo logs");
    } finally {
      setSyncingMemos(false);
      setLoading(false);
    }
  }, [hasApiConfigError, settings.memoDisplayCount]);

  useEffect(() => {
    const runInitialSync = async () => {
      // 初期表示は「先出しキャッシュ → サーバー再取得 → 同期待ち再送」の順で実行する。
      await refreshMemos();
      await syncPendingMemos();
    };
    void runInitialSync();
  }, [refreshMemos, syncPendingMemos]);

  useEffect(() => {
    if (hasApiConfigError) {
      return;
    }
    const loadPomodoroSettings = async () => {
      try {
        const fetched = await fetchJson<PomodoroSettings>("/api/v1/settings/pomodoro");
        setPomodoroSettings(fetched);
        setPomodoroSettingsDraft(fetched);
      } catch (eventualError) {
        setError(
          eventualError instanceof Error
            ? eventualError.message
            : "failed to load pomodoro settings",
        );
      }
    };
    void loadPomodoroSettings();
  }, [hasApiConfigError]);

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

      setError("");
      // 先にローカルへ反映し、通信はバックグラウンドで実行する。
      const payload: MemoCreatePayload = {
        title: inferTitleFromBody(composerBody),
        body_md: composerBody.trim(),
        log_date: new Date().toISOString().slice(0, 10),
        tags: composerTags,
        // セッション紐づけUIは未提供のため、現時点はnull固定で送信する。
        related_session_id: null,
      };
      // 1) localStorageの同期待ちキューへ積む 2) 画面へ即時反映、を先に行う。
      const queued = enqueueMemoCreate(window.localStorage, payload);
      setPendingSyncCount(queued.queue.length);
      setMemoLogs((prev) => mergeMemoList(prev, [queued.preview]));
      setComposerBody("");
      setComposerTags([]);
      setComposerTagInput("");
      // 入力完了後に非同期送信を開始。失敗時はキューが残るので再試行できる。
      void syncPendingMemos();
    },
    [composerBody, composerTags, syncPendingMemos],
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
    if (source.sync_status === "pending") {
      setError("同期待ちメモは同期完了後に編集できます");
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
      setMemoLogs((prev) =>
        prev.map((memo) => (memo.id === editingId ? markSyncedMemo(updated) : memo)),
      );
      cancelEditing();
    } catch (eventualError) {
      setError(eventualError instanceof Error ? eventualError.message : "failed to update");
    } finally {
      setSubmitting(false);
    }
  }, [cancelEditing, editBody, editTags, editingId, memoLogs]);

  const handleDelete = useCallback(
    async (memoId: string) => {
      const target = memoLogs.find((memo) => memo.id === memoId);
      if (!target) {
        return;
      }
      if (target.sync_status === "pending") {
        const filteredQueue = loadPendingMemoQueue(window.localStorage).filter(
          (item) => buildPendingPreviewId(item.client_id) !== memoId,
        );
        savePendingMemoQueue(window.localStorage, filteredQueue);
        setPendingSyncCount(filteredQueue.length);
        setMemoLogs((prev) => prev.filter((memo) => memo.id !== memoId));
        return;
      }
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
    [cancelEditing, editingId, memoLogs],
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

  const visibleMemos = useMemo(
    () => renderedMemos.slice(0, settings.memoDisplayCount),
    [renderedMemos, settings.memoDisplayCount],
  );

  const handleMemoDisplayCountChange = useCallback((rawValue: string) => {
    const parsed = Number(rawValue);
    const next = Number.isFinite(parsed)
      ? clampInt(parsed, MIN_MEMO_DISPLAY_COUNT, MAX_MEMO_DISPLAY_COUNT)
      : DEFAULT_MEMO_DISPLAY_COUNT;
    setSettings((prev) => ({ ...prev, memoDisplayCount: next }));
    setSettingsNotice("");
  }, []);

  const handleMemoFontSizeChange = useCallback((rawValue: string) => {
    const parsed = Number(rawValue);
    const next = Number.isFinite(parsed)
      ? clampInt(parsed, MIN_MEMO_FONT_SIZE_PX, MAX_MEMO_FONT_SIZE_PX)
      : DEFAULT_MEMO_FONT_SIZE_PX;
    setSettings((prev) => ({ ...prev, memoFontSizePx: next }));
    setSettingsNotice("");
  }, []);

  const handleResetSettings = useCallback(() => {
    setSettings(getDefaultSettings());
    resetThemePreference();
    setSettingsNotice("設定を初期値に戻しました。");
  }, [resetThemePreference]);

  const handlePomodoroSettingChange = useCallback(
    (field: keyof PomodoroSettings, value: string) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      setPomodoroSettingsDraft((prev) => {
        if (!prev) {
          return prev;
        }
        return { ...prev, [field]: Math.max(1, Math.round(numeric)) };
      });
      setSettingsNotice("");
    },
    [],
  );

  const handleSavePomodoroSettings = useCallback(async () => {
    if (!pomodoroSettingsDraft || hasApiConfigError) {
      return;
    }
    setPomodoroSettingsSaving(true);
    setSettingsNotice("");
    try {
      const payload = {
        focus_minutes: clampInt(pomodoroSettingsDraft.focus_minutes, 1, 180),
        short_break_minutes: clampInt(pomodoroSettingsDraft.short_break_minutes, 1, 60),
        long_break_minutes: clampInt(pomodoroSettingsDraft.long_break_minutes, 1, 120),
        long_break_every: clampInt(pomodoroSettingsDraft.long_break_every, 2, 12),
      };
      const updated = await fetchJson<PomodoroSettings>("/api/v1/settings/pomodoro", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setPomodoroSettings(updated);
      setPomodoroSettingsDraft(updated);
      setSettingsNotice("セッション設定を保存しました。");
    } catch (eventualError) {
      setError(
        eventualError instanceof Error ? eventualError.message : "failed to save pomodoro settings",
      );
    } finally {
      setPomodoroSettingsSaving(false);
    }
  }, [hasApiConfigError, pomodoroSettingsDraft]);
  const contentStyle = {
    [MEMO_FONT_SIZE_CSS_VAR]: `${settings.memoFontSizePx}px`,
  } as CSSProperties;

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
            <button
              type="button"
              className={`menu-tab${activeView === "memo" ? " active" : ""}`}
              onClick={() => setActiveView("memo")}
            >
              Memo
            </button>
            <button
              type="button"
              className={`menu-tab${activeView === "session" ? " active" : ""}`}
              onClick={() => setActiveView("session")}
            >
              Session
            </button>
            <button
              type="button"
              className={`menu-tab${activeView === "settings" ? " active" : ""}`}
              onClick={() => setActiveView("settings")}
            >
              Settings
            </button>
          </nav>
          <button type="button" className="theme-toggle-btn" onClick={toggleTheme}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="content" style={contentStyle}>
        {activeView === "memo" ? (
          <>
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
                        onClick={() =>
                          setComposerTags((prev) => prev.filter((item) => item !== tag))
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

            {!loading && (syncingMemos || pendingSyncCount > 0) ? (
              <p className="status-text">
                {syncingMemos ? "サーバー同期中..." : null}
                {syncingMemos && pendingSyncCount > 0 ? " / " : null}
                {pendingSyncCount > 0 ? `同期待ち ${pendingSyncCount} 件` : null}
              </p>
            ) : null}

            {!loading && renderedMemos.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No memos yet</p>
                <p className="empty-note">Start writing above to create your first memo.</p>
              </div>
            ) : null}

            <p className="status-text">{visibleMemos.length}件を表示</p>

            <section aria-label="Memo log" className="timeline">
              {visibleMemos.map((memo) => {
                const isEditing = editingId === memo.id;
                const isPending = memo.sync_status === "pending";
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
                          <div className="memo-meta">
                            <div className="memo-date">
                              <time dateTime={memo.created_at}>{memo.absoluteDate}</time>
                              {memo.relativeDate ? <span>{` / ${memo.relativeDate}`}</span> : null}
                              {isPending ? (
                                <span className="memo-sync-chip"> / 同期待ち</span>
                              ) : null}
                            </div>
                            <div className="row-toolbar">
                              <button
                                type="button"
                                className="row-icon-btn"
                                onClick={() => startEditing(memo)}
                                disabled={isPending}
                                title={isPending ? "同期待ちは編集できません" : undefined}
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
                                title={isPending ? "同期待ちはローカルから削除します" : undefined}
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
                          </div>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </section>
          </>
        ) : null}

        <section
          className="session-tab-panel"
          aria-label="Session view"
          hidden={activeView !== "session"}
        >
          <SessionView settings={pomodoroSettings} />
        </section>

        {activeView === "settings" ? (
          <section className="settings-panel" aria-label="Settings">
            <h1 className="settings-title">Settings</h1>
            <p className="settings-note">メモログとセッションの設定をここで管理します。</p>

            <section className="settings-card" aria-label="Memo log settings">
              <h2>Memo Log</h2>
              <label className="settings-field" htmlFor="memo-display-count">
                <span>メモ記入画面での過去メモ表示数</span>
                <input
                  id="memo-display-count"
                  type="number"
                  min={MIN_MEMO_DISPLAY_COUNT}
                  max={MAX_MEMO_DISPLAY_COUNT}
                  value={settings.memoDisplayCount}
                  onChange={(event) => handleMemoDisplayCountChange(event.target.value)}
                />
              </label>
              <label className="settings-field" htmlFor="memo-font-size">
                <span>メモの文字サイズ (px)</span>
                <input
                  id="memo-font-size"
                  type="number"
                  min={MIN_MEMO_FONT_SIZE_PX}
                  max={MAX_MEMO_FONT_SIZE_PX}
                  value={settings.memoFontSizePx}
                  onChange={(event) => handleMemoFontSizeChange(event.target.value)}
                />
              </label>
            </section>

            <section className="settings-card" aria-label="Session settings">
              <h2>Session</h2>
              {pomodoroSettingsDraft ? (
                <>
                  <label className="settings-field" htmlFor="focus-minutes">
                    <span>Focus minutes</span>
                    <input
                      id="focus-minutes"
                      type="number"
                      min={1}
                      max={180}
                      value={pomodoroSettingsDraft.focus_minutes}
                      onChange={(event) =>
                        handlePomodoroSettingChange("focus_minutes", event.target.value)
                      }
                    />
                  </label>
                  <label className="settings-field" htmlFor="short-break-minutes">
                    <span>Short break minutes</span>
                    <input
                      id="short-break-minutes"
                      type="number"
                      min={1}
                      max={60}
                      value={pomodoroSettingsDraft.short_break_minutes}
                      onChange={(event) =>
                        handlePomodoroSettingChange("short_break_minutes", event.target.value)
                      }
                    />
                  </label>
                  <label className="settings-field" htmlFor="long-break-minutes">
                    <span>Long break minutes</span>
                    <input
                      id="long-break-minutes"
                      type="number"
                      min={1}
                      max={120}
                      value={pomodoroSettingsDraft.long_break_minutes}
                      onChange={(event) =>
                        handlePomodoroSettingChange("long_break_minutes", event.target.value)
                      }
                    />
                  </label>
                  <label className="settings-field" htmlFor="long-break-every">
                    <span>Long break every</span>
                    <input
                      id="long-break-every"
                      type="number"
                      min={2}
                      max={12}
                      value={pomodoroSettingsDraft.long_break_every}
                      onChange={(event) =>
                        handlePomodoroSettingChange("long_break_every", event.target.value)
                      }
                    />
                  </label>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="save-btn"
                      onClick={() => void handleSavePomodoroSettings()}
                      disabled={pomodoroSettingsSaving}
                    >
                      Session設定を保存
                    </button>
                  </div>
                </>
              ) : (
                <p className="settings-note">Loading session settings...</p>
              )}
            </section>

            <div className="settings-actions">
              <button type="button" className="save-btn" onClick={handleResetSettings}>
                設定を初期値に戻す
              </button>
              {settingsNotice ? <p className="settings-notice">{settingsNotice}</p> : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
