/** 設定値を最小/最大の範囲に丸める。 */
export function clampInt(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

/** カンマ区切りテキストを重複なしタグ配列へ変換する。 */
export function parseTagText(tagText: string): string[] {
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
export function inferTitleFromBody(body: string): string {
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
export function renderMarkdown(markdown: string): string {
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
          .map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-]\s+/, ""))}</li>`)
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

/** メモ表示用の相対時刻を生成する。 */
export function formatRelativeTime(iso: string): string {
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
