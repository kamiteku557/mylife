import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionPhase = "focus" | "break";
type TimerStatus = "ready" | "running" | "paused";
type ServerSessionType = "focus" | "short_break" | "long_break";
type ServerSessionStatus = "running" | "paused" | "completed" | "cancelled";

interface SessionSettings {
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
}

interface SessionViewProps {
  settings: SessionSettings | null;
}

interface TimerState {
  sessionId: string | null;
  phase: SessionPhase;
  status: TimerStatus;
  remainingSec: number;
  label: string;
  tags: string[];
  cycleIndex: number;
}

interface ServerSession {
  id: string;
  title: string;
  session_type: ServerSessionType;
  status: ServerSessionStatus;
  planned_seconds: number;
  actual_seconds: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  tags: string[];
  remaining_seconds: number;
}

interface SessionLogItem {
  id: string;
  phase: SessionPhase;
  label: string;
  tags: string[];
  durationSec: number;
  pausedSec: number;
  startedAtIso: string;
  completedAtIso: string;
  status: ServerSessionStatus;
}

interface SessionGroup {
  key: string;
  label: string;
  sessions: SessionLogItem[];
  focusDurationSec: number;
  focusCount: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

interface NotificationSoundPlayer {
  prepare: () => Promise<void>;
  play: () => void;
}

/** 通知音プレイヤーを返す。将来の音声ファイル実装差し替え点。 */
function createNotificationSoundPlayer(): NotificationSoundPlayer {
  let audioContext: AudioContext | null = null;

  const resolveAudioContextCtor = () => {
    if (typeof window === "undefined") {
      return null;
    }
    return (
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
      null
    );
  };

  return {
    async prepare() {
      const contextCtor = resolveAudioContextCtor();
      if (!contextCtor) {
        return;
      }
      if (!audioContext) {
        audioContext = new contextCtor();
      }
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    },
    play() {
      const context = audioContext;
      if (!context || context.state !== "running") {
        return;
      }
      const now = context.currentTime;
      const beepTimings = [0, 0.2];
      beepTimings.forEach((offset) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.16);
      });
    },
  };
}

/** 現在の設定値から初期タイマー状態を生成する。 */
function createInitialTimerState(settings: SessionSettings | null): TimerState {
  return {
    sessionId: null,
    phase: "focus",
    status: "ready",
    remainingSec: (settings?.focus_minutes ?? 25) * 60,
    label: "",
    tags: [],
    cycleIndex: 1,
  };
}

/** focus/break 表示状態を API の session_type へ変換する。 */
function toServerSessionType(phase: SessionPhase): ServerSessionType {
  return phase === "focus" ? "focus" : "short_break";
}

/** API の session_type を UI 表示状態へ変換する。 */
function toPhase(sessionType: ServerSessionType): SessionPhase {
  return sessionType === "focus" ? "focus" : "break";
}

/** タイマー表示用の時刻フォーマットを返す。 */
function formatClock(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 履歴表示用の短い時刻フォーマット。 */
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** 秒数を見やすい分表記へ変換する。 */
function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

/** 日付グループ見出し用ラベルを返す。 */
function formatDayLabel(date: Date): string {
  const today = new Date();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((current.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) {
    return "TODAY";
  }
  if (diffDays === 1) {
    return "YESTERDAY";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  })
    .format(date)
    .toUpperCase();
}

/** タグ入力文字列を正規化し、重複を除去して返す。 */
function parseTags(raw: string): string[] {
  const unique = new Set<string>();
  return raw
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

/** 共通 JSON fetch。非2xx は Error へ正規化する。 */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured.");
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

/** API セッションを UI 用タイマー状態へ変換する。 */
function toTimerStateFromServer(session: ServerSession): TimerState {
  return {
    sessionId: session.id,
    phase: toPhase(session.session_type),
    status: session.status === "paused" ? "paused" : "running",
    remainingSec: session.remaining_seconds,
    label: session.title,
    tags: session.tags,
    cycleIndex: 1,
  };
}

/** API 履歴を UI 表示用履歴へ変換する。 */
function toSessionLogItems(sessions: ServerSession[]): SessionLogItem[] {
  return sessions
    .filter((session) => session.status === "completed" || session.status === "cancelled")
    .map((session) => {
      const paused = Math.max(
        0,
        session.planned_seconds - session.actual_seconds - session.remaining_seconds,
      );
      return {
        id: session.id,
        phase: toPhase(session.session_type),
        label: session.title || (session.session_type === "focus" ? "Focus session" : "Break"),
        tags: session.tags,
        durationSec: session.actual_seconds,
        pausedSec: paused,
        startedAtIso: session.created_at,
        completedAtIso: session.ended_at ?? session.created_at,
        status: session.status,
      };
    });
}

/** セッション履歴を日付ごとに集約する。 */
function groupSessions(items: SessionLogItem[]): SessionGroup[] {
  const map = new Map<string, SessionLogItem[]>();
  items.forEach((item) => {
    const day = new Date(item.completedAtIso);
    const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, sessions]) => {
      const focusItems = sessions.filter(
        (session) => session.phase === "focus" && session.status === "completed",
      );
      return {
        key,
        label: formatDayLabel(new Date(sessions[0].completedAtIso)),
        sessions,
        focusDurationSec: focusItems.reduce((total, session) => total + session.durationSec, 0),
        focusCount: focusItems.length,
      };
    });
}

/** BL-005/BL-004: バックエンド主導のポモドーロ UI。 */
export function SessionView({ settings }: SessionViewProps) {
  const [timer, setTimer] = useState<TimerState>(() => createInitialTimerState(settings));
  const [tagInput, setTagInput] = useState("");
  const [sessionLogs, setSessionLogs] = useState<SessionLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const notificationPermissionRequestedRef = useRef(false);
  const notificationSoundPlayerRef = useRef<NotificationSoundPlayer>(
    createNotificationSoundPlayer(),
  );
  const notifiedZeroSessionIdRef = useRef<string | null>(null);
  const notifiedOverrunStepRef = useRef(0);

  const focusSeconds = (settings?.focus_minutes ?? 25) * 60;
  const shortBreakSeconds = (settings?.short_break_minutes ?? 5) * 60;

  const resetToReady = useCallback(
    (phase: SessionPhase, keepDraft: boolean) => {
      setTimer((prev) => ({
        sessionId: null,
        phase,
        status: "ready",
        remainingSec: phase === "focus" ? focusSeconds : shortBreakSeconds,
        label: keepDraft ? prev.label : "",
        tags: keepDraft ? prev.tags : [],
        cycleIndex: prev.cycleIndex,
      }));
    },
    [focusSeconds, shortBreakSeconds],
  );

  /** ブラウザ通知が利用可能な場合に通知権限をリクエストする。 */
  const ensureNotificationPermission = useCallback(async (): Promise<
    NotificationPermission | "unsupported"
  > => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    if (Notification.permission !== "default") {
      return Notification.permission;
    }
    if (notificationPermissionRequestedRef.current) {
      return Notification.permission;
    }
    notificationPermissionRequestedRef.current = true;
    return Notification.requestPermission();
  }, []);

  /** 通知権限が許可済みの場合のみブラウザ通知を表示する。 */
  const pushNotification = useCallback((title: string, body: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") {
      return;
    }
    new Notification(title, { body });
    notificationSoundPlayerRef.current.play();
  }, []);

  const refreshFromServer = useCallback(async () => {
    const [current, sessions] = await Promise.all([
      fetchJson<ServerSession | null>("/api/v1/pomodoro/current"),
      fetchJson<ServerSession[]>("/api/v1/pomodoro/sessions?limit=200"),
    ]);

    setSessionLogs(toSessionLogItems(sessions));
    if (current) {
      setTimer(toTimerStateFromServer(current));
    } else {
      resetToReady("focus", false);
    }
  }, [resetToReady]);

  const persistSessionMeta = useCallback(
    async (nextTitle: string, nextTags: string[]) => {
      if (!timer.sessionId || timer.phase !== "focus" || timer.status === "ready") {
        return;
      }
      try {
        const updated = await fetchJson<ServerSession>(`/api/v1/pomodoro/${timer.sessionId}`, {
          method: "PUT",
          body: JSON.stringify({
            title: nextTitle,
            tags: nextTags,
          }),
        });
        setTimer(toTimerStateFromServer(updated));
      } catch (eventualError) {
        setError(
          eventualError instanceof Error ? eventualError.message : "failed to update session",
        );
      }
    },
    [timer.phase, timer.sessionId, timer.status],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        await refreshFromServer();
      } catch (eventualError) {
        setError(eventualError instanceof Error ? eventualError.message : "failed to load session");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [refreshFromServer]);

  useEffect(() => {
    if (timer.status !== "running") {
      return;
    }

    const id = window.setInterval(() => {
      setTimer((prev) => ({ ...prev, remainingSec: prev.remainingSec - 1 }));
    }, 1000);

    return () => {
      window.clearInterval(id);
    };
  }, [timer.status]);

  useEffect(() => {
    notifiedZeroSessionIdRef.current = null;
    notifiedOverrunStepRef.current = 0;
  }, [timer.sessionId]);

  useEffect(() => {
    if (timer.status !== "running" || !timer.sessionId) {
      return;
    }

    if (timer.remainingSec <= 0 && notifiedZeroSessionIdRef.current !== timer.sessionId) {
      notifiedZeroSessionIdRef.current = timer.sessionId;
      const phaseLabel = timer.phase === "focus" ? "作業" : "休憩";
      pushNotification(
        "ポモドーロ時間に到達しました",
        `${phaseLabel}セッションが 00:00 になりました。`,
      );
    }

    const overrunSec = Math.max(0, -timer.remainingSec);
    const nextOverrunStep = Math.floor(overrunSec / (15 * 60));
    if (nextOverrunStep <= 0 || nextOverrunStep <= notifiedOverrunStepRef.current) {
      return;
    }
    notifiedOverrunStepRef.current = nextOverrunStep;
    const overrunMinutes = nextOverrunStep * 15;
    pushNotification(
      "ポモドーロ超過時間のお知らせ",
      `計画時間を ${overrunMinutes} 分超過しています。`,
    );
  }, [pushNotification, timer.phase, timer.remainingSec, timer.sessionId, timer.status]);

  const addTag = useCallback(() => {
    const nextTags = parseTags(tagInput).filter((tag) => !timer.tags.includes(tag));
    if (nextTags.length === 0) {
      return;
    }
    const mergedTags = [...timer.tags, ...nextTags];
    setTimer((prev) => ({ ...prev, tags: mergedTags }));
    void persistSessionMeta(timer.label, mergedTags);
    setTagInput("");
  }, [persistSessionMeta, tagInput, timer.label, timer.tags]);

  const removeTag = useCallback(
    (tag: string) => {
      const nextTags = timer.tags.filter((current) => current !== tag);
      setTimer((prev) => ({ ...prev, tags: nextTags }));
      void persistSessionMeta(timer.label, nextTags);
    },
    [persistSessionMeta, timer.label, timer.tags],
  );

  const handleTagKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addTag();
      }
      if (event.key === "Backspace" && tagInput === "" && timer.tags.length > 0) {
        setTimer((prev) => ({ ...prev, tags: prev.tags.slice(0, -1) }));
      }
    },
    [addTag, tagInput, timer.tags.length],
  );

  const start = useCallback(async () => {
    if (actionPending) {
      return;
    }
    await ensureNotificationPermission();
    await notificationSoundPlayerRef.current.prepare();
    setActionPending(true);
    setError("");
    try {
      if (timer.status === "paused" && timer.sessionId) {
        await fetchJson<ServerSession>(`/api/v1/pomodoro/${timer.sessionId}/resume`, {
          method: "POST",
        });
      } else {
        await fetchJson<ServerSession>("/api/v1/pomodoro/start", {
          method: "POST",
          body: JSON.stringify({
            title: timer.label,
            session_type: toServerSessionType(timer.phase),
            cycle_index: timer.cycleIndex,
            tags: timer.phase === "focus" ? timer.tags : [],
          }),
        });
      }
      await refreshFromServer();
    } catch (eventualError) {
      setError(eventualError instanceof Error ? eventualError.message : "failed to start session");
    } finally {
      setActionPending(false);
    }
  }, [actionPending, ensureNotificationPermission, refreshFromServer, timer]);

  const pause = useCallback(async () => {
    if (!timer.sessionId) {
      return;
    }
    if (actionPending) {
      return;
    }
    setActionPending(true);
    setError("");
    try {
      await fetchJson<ServerSession>(`/api/v1/pomodoro/${timer.sessionId}/pause`, {
        method: "POST",
      });
      await refreshFromServer();
    } catch (eventualError) {
      setError(eventualError instanceof Error ? eventualError.message : "failed to pause session");
    } finally {
      setActionPending(false);
    }
  }, [actionPending, refreshFromServer, timer.sessionId]);

  const reset = useCallback(async () => {
    if (actionPending) {
      return;
    }
    setActionPending(true);
    setError("");
    try {
      if (timer.sessionId) {
        await fetchJson<ServerSession>(`/api/v1/pomodoro/${timer.sessionId}/cancel`, {
          method: "POST",
        });
      }
      resetToReady(timer.phase, true);
      await refreshFromServer();
    } catch (eventualError) {
      setError(eventualError instanceof Error ? eventualError.message : "failed to reset session");
    } finally {
      setActionPending(false);
    }
  }, [actionPending, refreshFromServer, resetToReady, timer.phase, timer.sessionId]);

  const discard = useCallback(async () => {
    if (actionPending) {
      return;
    }
    setActionPending(true);
    setError("");
    try {
      if (timer.sessionId) {
        await fetchJson<ServerSession>(`/api/v1/pomodoro/${timer.sessionId}/cancel`, {
          method: "POST",
        });
      }
      setTagInput("");
      setTimer(createInitialTimerState(settings));
      await refreshFromServer();
    } catch (eventualError) {
      setError(
        eventualError instanceof Error ? eventualError.message : "failed to discard session",
      );
    } finally {
      setActionPending(false);
    }
  }, [actionPending, refreshFromServer, settings, timer.sessionId]);

  const finishAndTransition = useCallback(
    async (sourcePhase: SessionPhase, startNextPhase: boolean) => {
      if (!timer.sessionId) {
        return;
      }
      if (actionPending) {
        return;
      }
      setActionPending(true);
      setError("");
      try {
        await fetchJson<ServerSession>(`/api/v1/pomodoro/${timer.sessionId}/finish`, {
          method: "POST",
        });

        if (startNextPhase) {
          const nextType = sourcePhase === "focus" ? "short_break" : "focus";
          const nextTitle = nextType === "short_break" ? "Break" : "";
          await fetchJson<ServerSession>("/api/v1/pomodoro/start", {
            method: "POST",
            body: JSON.stringify({
              title: nextTitle,
              session_type: nextType,
              cycle_index: timer.cycleIndex,
              tags: [],
            }),
          });
        }

        await refreshFromServer();
      } catch (eventualError) {
        setError(
          eventualError instanceof Error ? eventualError.message : "failed to finish session",
        );
      } finally {
        setActionPending(false);
      }
    },
    [actionPending, refreshFromServer, timer.cycleIndex, timer.sessionId],
  );

  const stopCurrentPhase = useCallback(() => {
    const sourcePhase = timer.phase;
    void finishAndTransition(sourcePhase, true);
  }, [finishAndTransition, timer.phase]);

  const ringRatio = useMemo(() => {
    const total = timer.phase === "focus" ? focusSeconds : shortBreakSeconds;
    return Math.max(0, Math.min(1, 1 - timer.remainingSec / total));
  }, [focusSeconds, shortBreakSeconds, timer.phase, timer.remainingSec]);

  const sessionGroups = useMemo(() => groupSessions(sessionLogs), [sessionLogs]);

  const radius = 150;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - ringRatio);

  const canEditSession = timer.phase === "focus";
  const mainLabel =
    timer.phase === "break" ? "BREAK" : timer.status === "ready" ? "READY" : "FOCUS";

  return (
    <section className="session-view" aria-label="Pomodoro session">
      <div className={`session-hero${timer.phase === "break" ? " is-break" : ""}`}>
        <input
          value={timer.label}
          onChange={(event) => setTimer((prev) => ({ ...prev, label: event.target.value }))}
          onBlur={() => void persistSessionMeta(timer.label, timer.tags)}
          className="session-title-input"
          placeholder="What are you working on?"
          disabled={!canEditSession}
        />

        {canEditSession ? (
          <div className="session-tags-row">
            {timer.tags.map((tag) => (
              <span key={tag} className="tag-pill">
                <span className="tag-mark">#</span>
                {tag}
                <button
                  type="button"
                  className="tag-remove"
                  onClick={() => removeTag(tag)}
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
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder="Add tag..."
                className="tag-input"
              />
            </span>
          </div>
        ) : null}

        <div className="session-clock-wrap">
          <svg viewBox="0 0 320 320" className="session-ring" aria-hidden="true">
            <circle className="session-ring-base" cx="160" cy="160" r={radius} />
            <circle
              className="session-ring-progress"
              cx="160"
              cy="160"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
            />
          </svg>
          <div className="session-clock-text">
            <p className="session-clock-time">{formatClock(timer.remainingSec)}</p>
            <p className="session-clock-state">{mainLabel}</p>
          </div>
        </div>

        <div className="session-controls">
          {timer.status === "running" ? (
            <button
              type="button"
              className="session-main-btn"
              onClick={() => void pause()}
              disabled={actionPending || loading}
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="session-main-btn"
              onClick={() => void start()}
              disabled={actionPending || loading}
            >
              {timer.status === "paused" ? "Resume" : "Start"}
            </button>
          )}

          {timer.status !== "ready" ? (
            <>
              <button
                type="button"
                className="session-sub-btn"
                onClick={() => void stopCurrentPhase()}
                disabled={actionPending || loading}
              >
                Stop
              </button>
              <button
                type="button"
                className="session-sub-btn"
                onClick={() => void reset()}
                disabled={actionPending || loading}
              >
                Reset
              </button>
              <button
                type="button"
                className="session-sub-btn"
                onClick={() => void discard()}
                disabled={actionPending || loading}
              >
                Discard
              </button>
            </>
          ) : null}
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
        {loading ? <p className="status-text">Loading...</p> : null}
      </div>

      <div className="session-history">
        {sessionGroups.length === 0 ? (
          <p className="status-text">No sessions yet.</p>
        ) : (
          sessionGroups.map((group) => (
            <section key={group.key} className="session-day-block">
              <div className="session-day-header">
                <h2>{group.label}</h2>
                <p>
                  {group.focusCount} sessions / {formatMinutes(group.focusDurationSec)} focused
                </p>
              </div>

              {group.sessions.map((item) => (
                <article key={item.id} className="session-log-item">
                  <div className={`session-log-icon ${item.phase === "break" ? "is-break" : ""}`} />
                  <div className="session-log-content">
                    <h3>
                      {item.label}
                      {item.status === "cancelled" ? " (cancelled)" : ""}
                    </h3>
                    {item.tags.length > 0 ? (
                      <div className="session-log-tags">
                        {item.tags.map((tag) => (
                          <span key={tag} className="tag-pill outline">
                            <span className="tag-mark">#</span>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p>
                      {formatTime(item.startedAtIso)} - {formatTime(item.completedAtIso)} |{" "}
                      {formatMinutes(item.durationSec)}
                    </p>
                  </div>
                </article>
              ))}
            </section>
          ))
        )}
      </div>
    </section>
  );
}
