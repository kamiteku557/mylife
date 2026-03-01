/** 前回更新時刻から経過した秒数を整数で返す。 */
export function elapsedWholeSeconds(lastEpochMs: number, nowEpochMs: number): number {
  const diffMs = Math.max(0, nowEpochMs - lastEpochMs);
  return Math.floor(diffMs / 1000);
}
