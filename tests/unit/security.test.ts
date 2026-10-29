import { afterEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, takeRateLimit } from "@/lib/auth/rate-limit";
import { logError } from "@/lib/log";
import { jsonLd } from "@/lib/site";
import { isUuid } from "@/lib/validation";

describe("takeRateLimit", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_MULTIPLIER;
  });

  it("allows up to the limit per subject within the window, then blocks", () => {
    const { limit, windowMs } = RATE_LIMITS.message;
    const now = 1_000_000;
    for (let i = 0; i < limit; i++) expect(takeRateLimit("message", "u1", now)).toBe(true);
    expect(takeRateLimit("message", "u1", now)).toBe(false);
    // مستخدم آخر غير متأثر، والنافذة تنتهي
    expect(takeRateLimit("message", "u2", now)).toBe(true);
    expect(takeRateLimit("message", "u1", now + windowMs + 1)).toBe(true);
  });

  it("applies the e2e multiplier only when set", () => {
    process.env.RATE_LIMIT_MULTIPLIER = "3";
    const { limit } = RATE_LIMITS.signup;
    for (let i = 0; i < limit * 3; i++) expect(takeRateLimit("signup", "ip-m", 5)).toBe(true);
    expect(takeRateLimit("signup", "ip-m", 5)).toBe(false);
  });
});

describe("logError", () => {
  it("logs a redacted summary without values from Postgres detail", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("duplicate for user ali@example.com +966501234567"), {
      code: "23505",
      detail: "Key (email)=(ali@example.com) already exists.",
    });
    logError("signup", error);
    const printed = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toContain("23505");
    expect(printed).not.toContain("ali@example.com");
    expect(printed).not.toContain("966501234567");
    expect(printed).not.toContain("already exists");
    spy.mockRestore();
  });
});

describe("jsonLd", () => {
  it("cannot close the script tag or inject HTML", () => {
    const out = jsonLd({ name: "</script><script>alert(1)</script>&" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>&");
  });
});

describe("isUuid", () => {
  it("accepts only canonical uuids", () => {
    expect(isUuid("6f1c2a7e-3b9d-4c1a-9e2f-1a2b3c4d5e6f")).toBe(true);
    for (const bad of ["", "x", "6f1c2a7e-3b9d-4c1a-9e2f-1a2b3c4d5e6", "'; drop table", null, 5]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
