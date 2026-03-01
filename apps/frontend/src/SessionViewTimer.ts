/** 前回更新時刻から経過した秒数を整数で返す。 */
export function elapsedWholeSeconds(lastEpochMs: number, nowEpochMs: number): number {
  const diffMs = Math.max(0, nowEpochMs - lastEpochMs);
  return Math.floor(diffMs / 1000);
}

interface ResumeSyncGuardInput {
  hasActiveSession: boolean;
  inFlight: boolean;
  lastSyncEpochMs: number | null;
  nowEpochMs: number;
  minIntervalMs: number;
}

/** 復帰時の再同期 API 呼び出しを実行してよいか判定する。 */
export function shouldRunResumeSync(input: ResumeSyncGuardInput): boolean {
  if (!input.hasActiveSession || input.inFlight) {
    return false;
  }
  if (input.lastSyncEpochMs === null) {
    return true;
  }
  return input.nowEpochMs - input.lastSyncEpochMs >= input.minIntervalMs;
}
