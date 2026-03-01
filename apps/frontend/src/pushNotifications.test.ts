import { describe, expect, it } from "vitest";
import { base64UrlToUint8Array } from "./pushNotifications";

describe("pushNotifications utilities", () => {
  it("base64UrlToUint8Array は URL-safe base64 を Uint8Array へ変換できる", () => {
    const value = base64UrlToUint8Array("SGVsbG8");
    expect(Array.from(value)).toEqual([72, 101, 108, 108, 111]);
  });
});
