import { describe, expect, it } from "vitest";
import { elapsedWholeSeconds } from "./SessionViewTimer";

describe("SessionView timer utilities", () => {
  it("elapsedWholeSeconds は1秒未満を切り捨てる", () => {
    expect(elapsedWholeSeconds(1_000, 1_999)).toBe(0);
    expect(elapsedWholeSeconds(1_000, 2_000)).toBe(1);
    expect(elapsedWholeSeconds(1_000, 3_500)).toBe(2);
  });

  it("elapsedWholeSeconds は逆転時刻でも負値を返さない", () => {
    expect(elapsedWholeSeconds(2_000, 1_000)).toBe(0);
  });
});
