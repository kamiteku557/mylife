import { expect, test, type Page, type Route } from "@playwright/test";

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

async function setupApiMock(page: Page): Promise<void> {
  const memos: MemoLogRecord[] = [];

  await page.route("**/api/v1/settings/pomodoro", async (route) => {
    await jsonResponse(route, {
      focus_minutes: 25,
      short_break_minutes: 5,
      long_break_minutes: 20,
      long_break_every: 4,
    });
  });

  await page.route("**/api/v1/memo-logs*", async (route) => {
    try {
      const request = route.request();
      const method = request.method();
      const url = new URL(request.url());

      if (url.pathname === "/api/v1/memo-logs" && method === "GET") {
        await jsonResponse(route, memos);
        return;
      }

      if (url.pathname === "/api/v1/memo-logs" && method === "POST") {
        const payload = parseRequestJson<{
          title: string;
          body_md: string;
          log_date: string;
          tags: string[];
          related_session_id: string | null;
        }>(route);
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
        await jsonResponse(route, created, 201);
        return;
      }

      if (url.pathname.startsWith("/api/v1/memo-logs/") && method === "PUT") {
        const memoId = url.pathname.split("/").at(-1) ?? "";
        const payload = parseRequestJson<{
          title: string;
          body_md: string;
          log_date: string;
          tags: string[];
          related_session_id: string | null;
        }>(route);
        const index = memos.findIndex((memo) => memo.id === memoId);
        if (index < 0) {
          await jsonResponse(route, { detail: "memo log not found" }, 404);
          return;
        }

        const updated: MemoLogRecord = {
          ...memos[index],
          title: payload.title,
          body_md: payload.body_md,
          log_date: payload.log_date,
          tags: payload.tags,
          related_session_id: payload.related_session_id,
          updated_at: new Date().toISOString(),
        };
        memos[index] = updated;
        await jsonResponse(route, updated);
        return;
      }

      if (url.pathname.startsWith("/api/v1/memo-logs/") && method === "DELETE") {
        const memoId = url.pathname.split("/").at(-1) ?? "";
        const index = memos.findIndex((memo) => memo.id === memoId);
        if (index >= 0) {
          memos.splice(index, 1);
        }
        await route.fulfill({ status: 204 });
        return;
      }

      await jsonResponse(route, { detail: `Unhandled route: ${method} ${url.pathname}` }, 404);
    } catch (error) {
      await jsonResponse(route, { detail: `Mock handler failed: ${String(error)}` }, 500);
    }
  });
}

test("メモ導線の作成と編集開始をE2Eで検証する", async ({ page }) => {
  await setupApiMock(page);

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/");

  await expect(page.getByText("No memos yet")).toBeVisible();

  await page.getByPlaceholder("Write your memo... (Markdown supported)").fill("# E2Eメモ\n本文");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("E2Eメモ")).toBeVisible();

  await page.getByRole("button", { name: "Edit memo" }).click();
  await page.locator(".edit-textarea").fill("編集済みメモ");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("E2Eメモ")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete memo" })).toBeVisible();
});
