import { describe, expect, it } from "vitest";
import { elapsedWholeSeconds, shouldRunResumeSync } from "./SessionViewTimer";

describe("SessionView timer utilities", () => {
  it("elapsedWholeSeconds は1秒未満を切り捨てる", () => {
    expect(elapsedWholeSeconds(1_000, 1_999)).toBe(0);
    expect(elapsedWholeSeconds(1_000, 2_000)).toBe(1);
    expect(elapsedWholeSeconds(1_000, 3_500)).toBe(2);
  });

  it("elapsedWholeSeconds は逆転時刻でも負値を返さない", () => {
    expect(elapsedWholeSeconds(2_000, 1_000)).toBe(0);
  });

  it("shouldRunResumeSync はアクティブセッションなしでは false を返す", () => {
    expect(
      shouldRunResumeSync({
        hasActiveSession: false,
        inFlight: false,
        lastSyncEpochMs: null,
        nowEpochMs: 10_000,
        minIntervalMs: 2_000,
      }),
    ).toBe(false);
  });

  it("shouldRunResumeSync は実行中同期がある場合に false を返す", () => {
    expect(
      shouldRunResumeSync({
        hasActiveSession: true,
        inFlight: true,
        lastSyncEpochMs: null,
        nowEpochMs: 10_000,
        minIntervalMs: 2_000,
      }),
    ).toBe(false);
  });

  it("shouldRunResumeSync は初回同期を許可する", () => {
    expect(
      shouldRunResumeSync({
        hasActiveSession: true,
        inFlight: false,
        lastSyncEpochMs: null,
        nowEpochMs: 10_000,
        minIntervalMs: 2_000,
      }),
    ).toBe(true);
  });

  it("shouldRunResumeSync は最小間隔未満だと false を返す", () => {
    expect(
      shouldRunResumeSync({
        hasActiveSession: true,
        inFlight: false,
        lastSyncEpochMs: 9_500,
        nowEpochMs: 10_000,
        minIntervalMs: 2_000,
      }),
    ).toBe(false);
  });

  it("shouldRunResumeSync は最小間隔以上なら true を返す", () => {
    expect(
      shouldRunResumeSync({
        hasActiveSession: true,
        inFlight: false,
        lastSyncEpochMs: 7_000,
        nowEpochMs: 10_000,
        minIntervalMs: 2_000,
      }),
    ).toBe(true);
  });
});
