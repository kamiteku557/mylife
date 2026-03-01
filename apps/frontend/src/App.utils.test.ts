import { describe, expect, it, vi } from "vitest";
import {
  clampInt,
  formatRelativeTime,
  inferTitleFromBody,
  parseTagText,
  renderMarkdown,
} from "./appUtils";

describe("App utility functions", () => {
  it("clampInt は四捨五入と最小最大の丸め込みを行う", () => {
    expect(clampInt(4.4, 5, 100)).toBe(5);
    expect(clampInt(18.6, 5, 100)).toBe(19);
    expect(clampInt(120.2, 5, 100)).toBe(100);
  });

  it("parseTagText は空文字と重複を除去する", () => {
    expect(parseTagText(" work,idea, work , ,deep ")).toEqual(["work", "idea", "deep"]);
  });

  it("inferTitleFromBody は先頭有効行からタイトルを推定する", () => {
    expect(inferTitleFromBody("\n# Heading\n本文")).toBe("Heading");
    expect(inferTitleFromBody("\n- 箇条書き\n本文")).toBe("箇条書き");
    expect(inferTitleFromBody("\n\n")).toBe("");
  });

  it("renderMarkdown は最低限の装飾をHTMLへ変換し危険文字をエスケープする", () => {
    const rendered = renderMarkdown("# 見出し\n\n- one\n- two\n\n<script>alert(1)</script>");
    expect(rendered).toContain("<h1>見出し</h1>");
    expect(rendered).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(rendered).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("formatRelativeTime は現在時刻との差分を短い文字列で返す", () => {
    const now = new Date("2026-03-01T12:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);

    expect(formatRelativeTime("2026-03-01T11:59:31Z")).toBe("just now");
    expect(formatRelativeTime("2026-03-01T11:20:00Z")).toBe("40m ago");
    expect(formatRelativeTime("2026-03-01T08:00:00Z")).toBe("4h ago");
  });
});
