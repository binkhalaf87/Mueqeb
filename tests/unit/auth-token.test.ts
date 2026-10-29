import { beforeAll, describe, expect, it } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  signFileToken,
  signSession,
  verifyFileToken,
  verifySession,
} from "@/lib/auth/token";

const USER = "6f1c2a7e-3b9d-4c1a-9e2f-1a2b3c4d5e6f";

beforeAll(() => {
  process.env.AUTH_SECRET = "unit-test-secret-0123456789abcdef0123456789";
});

describe("session tokens", () => {
  it("round-trips the user id", async () => {
    expect(await verifySession(await signSession(USER))).toBe(USER);
  });

  it("expires after the max age", async () => {
    const now = Date.now();
    const token = await signSession(USER, now);
    expect(await verifySession(token, now + (SESSION_MAX_AGE_SECONDS - 60) * 1000)).toBe(USER);
    expect(await verifySession(token, now + (SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBeNull();
  });

  it("rejects tampered, malformed and missing tokens", async () => {
    const token = await signSession(USER);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), sub: "x" }),
    ).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`)).toBeNull();
    expect(await verifySession(`${body}.${sig}x`)).toBeNull();
    expect(await verifySession(`${token}.extra`)).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(USER);
    process.env.AUTH_SECRET = "another-secret-0123456789abcdef0123456789ab";
    expect(await verifySession(token)).toBeNull();
    process.env.AUTH_SECRET = "unit-test-secret-0123456789abcdef0123456789";
  });

  it("refuses to run with a short or missing secret", async () => {
    const saved = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "short";
    await expect(signSession(USER)).rejects.toThrow("AUTH_SECRET");
    process.env.AUTH_SECRET = saved;
  });
});

describe("file tokens", () => {
  it("round-trips bucket and path until expiry", async () => {
    const now = Date.now();
    const token = await signFileToken("provider-documents", "a/b.pdf", 300, now);
    expect(await verifyFileToken(token, now)).toEqual({
      bucket: "provider-documents",
      path: "a/b.pdf",
    });
    expect(await verifyFileToken(token, now + 301_000)).toBeNull();
  });

  it("session and file tokens are not interchangeable", async () => {
    expect(await verifyFileToken(await signSession(USER))).toBeNull();
    expect(await verifySession(await signFileToken("b", "p.pdf", 60))).toBeNull();
  });
});

describe("login rate limit", () => {
  it("blocks after 10 failures within 15 minutes, per key", async () => {
    const { clearLoginFailures, isLoginBlocked, recordLoginFailure } =
      await import("@/lib/auth/rate-limit");
    const keys = ["id:test@example.com", "ip:1.2.3.4"];
    const now = Date.now();
    for (let i = 0; i < 9; i++) recordLoginFailure(keys, now);
    expect(isLoginBlocked(keys, now)).toBe(false);
    recordLoginFailure(keys, now);
    expect(isLoginBlocked(keys, now)).toBe(true);
    // حساب آخر من عنوان آخر غير متأثر
    expect(isLoginBlocked(["id:other@example.com", "ip:5.6.7.8"], now)).toBe(false);
    // تنتهي النافذة
    expect(isLoginBlocked(keys, now + 15 * 60_000 + 1)).toBe(false);
    recordLoginFailure(keys, now);
    clearLoginFailures(keys);
    expect(isLoginBlocked(keys, now)).toBe(false);
  });
});
