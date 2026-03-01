import { expect, test, type Page, type Route } from "@playwright/test";

interface PomodoroSettings {
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
}

type SessionType = "focus" | "short_break" | "long_break";
type SessionStatus = "running" | "paused" | "completed" | "cancelled";

interface PomodoroSession {
  id: string;
  title: string;
  session_type: SessionType;
  status: SessionStatus;
  planned_seconds: number;
  actual_seconds: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  tags: string[];
  remaining_seconds: number;
}

function jsonResponse(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function parseRequestJson<T extends object>(route: Route): T {
  const raw = route.request().postData();
  if (!raw) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

async function setupSessionApiMock(page: Page): Promise<void> {
  const settings: PomodoroSettings = {
    focus_minutes: 25,
    short_break_minutes: 5,
    long_break_minutes: 20,
    long_break_every: 4,
  };

  const sessions = new Map<string, PomodoroSession>();
  let sessionSequence = 0;
  let currentSessionId: string | null = null;

  const nextSessionId = () => {
    sessionSequence += 1;
    return `session-${sessionSequence}`;
  };

  const listSessions = () =>
    Array.from(sessions.values()).sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );

  await page.route("**/api/v1/memo-logs*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await jsonResponse(route, []);
      return;
    }
    await route.fulfill({ status: 204 });
  });

  await page.route("**/api/v1/settings/pomodoro", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await jsonResponse(route, settings);
      return;
    }
    if (request.method() === "PUT") {
      const payload = parseRequestJson<PomodoroSettings>(route);
      settings.focus_minutes = payload.focus_minutes;
      settings.short_break_minutes = payload.short_break_minutes;
      settings.long_break_minutes = payload.long_break_minutes;
      settings.long_break_every = payload.long_break_every;
      await jsonResponse(route, settings);
      return;
    }
    await jsonResponse(route, { detail: "method not allowed" }, 405);
  });

  await page.route("**/api/v1/pomodoro/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (pathname === "/api/v1/pomodoro/current" && method === "GET") {
      await jsonResponse(route, currentSessionId ? sessions.get(currentSessionId) : null);
      return;
    }

    if (pathname === "/api/v1/pomodoro/sessions" && method === "GET") {
      await jsonResponse(route, listSessions());
      return;
    }

    if (pathname === "/api/v1/pomodoro/start" && method === "POST") {
      const payload = parseRequestJson<{
        title: string;
        session_type: SessionType;
        cycle_index: number;
        tags: string[];
      }>(route);

      if (currentSessionId) {
        await jsonResponse(route, { detail: "active session already exists" }, 409);
        return;
      }

      const now = new Date().toISOString();
      const plannedSeconds =
        payload.session_type === "focus"
          ? settings.focus_minutes * 60
          : payload.session_type === "short_break"
            ? settings.short_break_minutes * 60
            : settings.long_break_minutes * 60;

      const created: PomodoroSession = {
        id: nextSessionId(),
        title: payload.title,
        session_type: payload.session_type,
        status: "running",
        planned_seconds: plannedSeconds,
        actual_seconds: 0,
        started_at: now,
        ended_at: null,
        created_at: now,
        tags: payload.tags,
        remaining_seconds: plannedSeconds,
      };

      sessions.set(created.id, created);
      currentSessionId = created.id;
      await jsonResponse(route, created, 201);
      return;
    }

    const actionMatch = pathname.match(
      /^\/api\/v1\/pomodoro\/([^/]+)\/(pause|resume|finish|cancel)$/,
    );
    if (actionMatch && method === "POST") {
      const [, sessionId, action] = actionMatch;
      const source = sessions.get(sessionId);
      if (!source) {
        await jsonResponse(route, { detail: "pomodoro session not found" }, 404);
        return;
      }

      if (action === "pause") {
        const paused: PomodoroSession = {
          ...source,
          status: "paused",
          actual_seconds: 300,
          remaining_seconds: Math.max(0, source.planned_seconds - 300),
        };
        sessions.set(sessionId, paused);
        await jsonResponse(route, paused);
        return;
      }

      if (action === "resume") {
        const resumed: PomodoroSession = {
          ...source,
          status: "running",
          started_at: new Date().toISOString(),
        };
        sessions.set(sessionId, resumed);
        await jsonResponse(route, resumed);
        return;
      }

      if (action === "finish") {
        const completed: PomodoroSession = {
          ...source,
          status: "completed",
          actual_seconds: source.planned_seconds,
          remaining_seconds: 0,
          ended_at: new Date().toISOString(),
        };
        sessions.set(sessionId, completed);
        if (currentSessionId === sessionId) {
          currentSessionId = null;
        }
        await jsonResponse(route, completed);
        return;
      }

      const cancelled: PomodoroSession = {
        ...source,
        status: "cancelled",
        ended_at: new Date().toISOString(),
      };
      sessions.set(sessionId, cancelled);
      if (currentSessionId === sessionId) {
        currentSessionId = null;
      }
      await jsonResponse(route, cancelled);
      return;
    }

    const updateMatch = pathname.match(/^\/api\/v1\/pomodoro\/([^/]+)$/);
    if (updateMatch && method === "PUT") {
      const sessionId = updateMatch[1];
      const source = sessions.get(sessionId);
      if (!source) {
        await jsonResponse(route, { detail: "pomodoro session not found" }, 404);
        return;
      }
      const payload = parseRequestJson<{ title: string; tags: string[] }>(route);
      const updated: PomodoroSession = {
        ...source,
        title: payload.title,
        tags: payload.tags,
      };
      sessions.set(sessionId, updated);
      await jsonResponse(route, updated);
      return;
    }

    await jsonResponse(route, { detail: `Unhandled route: ${method} ${pathname}` }, 404);
  });
}

test("Session主要導線（開始/一時停止/再開/完了）をE2Eで検証する", async ({ page }) => {
  await setupSessionApiMock(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Session" }).click();

  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.getByText("No sessions yet.")).toBeVisible();

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByText("FOCUS")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("BREAK")).toBeVisible();
  await expect(page.getByText("Focus session")).toBeVisible();
  await expect(page.getByText("1 sessions / 25m focused")).toBeVisible();
});
