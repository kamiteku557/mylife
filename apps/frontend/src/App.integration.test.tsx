import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

interface MemoLogRecord {
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

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createFetchMock(initialMemos: MemoLogRecord[]) {
  const memos = [...initialMemos];

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl);
    const method = (
      init?.method ?? (typeof input === "string" || input instanceof URL ? "GET" : input.method)
    ).toUpperCase();

    if (url.pathname === "/api/v1/settings/pomodoro" && method === "GET") {
      return createResponse({
        focus_minutes: 25,
        short_break_minutes: 5,
        long_break_minutes: 20,
        long_break_every: 4,
      });
    }

    if (url.pathname === "/api/v1/memo-logs" && method === "GET") {
      return createResponse(memos);
    }

    if (url.pathname === "/api/v1/memo-logs" && method === "POST") {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        title: string;
        body_md: string;
        tags: string[];
        log_date: string;
        related_session_id: string | null;
      };
      const now = new Date().toISOString();
      const created: MemoLogRecord = {
        id: `memo-${memos.length + 1}`,
        user_id: "00000000-0000-0000-0000-000000000001",
        title: payload.title,
        body_md: payload.body_md,
        log_date: payload.log_date,
        related_session_id: payload.related_session_id,
        tags: payload.tags,
        created_at: now,
        updated_at: now,
      };
      memos.unshift(created);
      return createResponse(created, 201);
    }

    if (url.pathname.startsWith("/api/v1/memo-logs/") && method === "PUT") {
      const segments = url.pathname.split("/");
      const memoId = segments[segments.length - 1] ?? "";
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        title: string;
        body_md: string;
        tags: string[];
        log_date: string;
        related_session_id: string | null;
      };
      const current = memos.find((memo) => memo.id === memoId);
      if (!current) {
        return createResponse({ detail: "memo log not found" }, 404);
      }
      const updated: MemoLogRecord = {
        ...current,
        title: payload.title,
        body_md: payload.body_md,
        tags: payload.tags,
        log_date: payload.log_date,
        related_session_id: payload.related_session_id,
        updated_at: new Date().toISOString(),
      };
      const index = memos.findIndex((memo) => memo.id === memoId);
      memos[index] = updated;
      return createResponse(updated);
    }

    if (url.pathname.startsWith("/api/v1/memo-logs/") && method === "DELETE") {
      const segments = url.pathname.split("/");
      const memoId = segments[segments.length - 1] ?? "";
      const index = memos.findIndex((memo) => memo.id === memoId);
      if (index >= 0) {
        memos.splice(index, 1);
      }
      return new Response(null, { status: 204 });
    }

    return createResponse({ detail: `Unhandled route: ${method} ${url.pathname}` }, 404);
  });
}

describe("App integration", () => {
  beforeEach(() => {
    window.localStorage.removeItem("mylife.settings.v1");
    window.localStorage.removeItem("mylife.theme-preference.v1");
  });

  it("メモ作成が完了すると一覧に追加表示される", async () => {
    const fetchMock = createFetchMock([
      {
        id: "memo-1",
        user_id: "00000000-0000-0000-0000-000000000001",
        title: "既存メモ",
        body_md: "既存メモ",
        log_date: "2026-03-01",
        related_session_id: null,
        tags: ["work"],
        created_at: "2026-03-01T08:00:00.000Z",
        updated_at: "2026-03-01T08:00:00.000Z",
      },
    ]);
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("既存メモ")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("Write your memo... (Markdown supported)"),
      "# 新規メモ\n本文テキスト",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("新規メモ")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/memo-logs"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("メモ編集と削除の一連操作を実行できる", async () => {
    const fetchMock = createFetchMock([
      {
        id: "memo-10",
        user_id: "00000000-0000-0000-0000-000000000001",
        title: "編集前",
        body_md: "編集前",
        log_date: "2026-03-01",
        related_session_id: null,
        tags: ["idea"],
        created_at: "2026-03-01T09:00:00.000Z",
        updated_at: "2026-03-01T09:00:00.000Z",
      },
    ]);
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("編集前")).toBeInTheDocument();
    });

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Edit memo" }));
    const editTextarea = screen.getByDisplayValue("編集前");
    await user.clear(editTextarea);
    await user.type(editTextarea, "編集後");

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("編集後")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Delete memo" }));

    await waitFor(() => {
      expect(screen.getByText("No memos yet")).toBeInTheDocument();
    });
  });
});
