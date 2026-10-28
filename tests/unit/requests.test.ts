import { describe, expect, it } from "vitest";
import { containsContactInfo, mentionsCredentials } from "@/lib/contact-info";
import { formatDuration, timeLeft } from "@/lib/format";
import { rpcErrorMessage } from "@/lib/requests/constants";
import { bidSchema, createRequestSchema } from "@/lib/requests/validation";

const uuid = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("containsContactInfo", () => {
  it.each([
    "اتصل على 0551234567",
    "جوالي 055 123 4567",
    "+966-55-123-4567",
    "٠٥٥١٢٣٤٥٦٧",
    "name@example.com",
    "https://example.com",
    "www.example.sa",
    "زوروا موقعنا example.com",
  ])("flags %s", (text) => {
    expect(containsContactInfo(text)).toBe(true);
  });

  it.each([
    "إصدار رخص عمل لثلاثة عمال",
    "المدة 3 أيام والسعر 250 ريال",
    "سجل تجاري رقم 12345",
    "",
    null,
  ])("allows %s", (text) => {
    expect(containsContactInfo(text)).toBe(false);
  });
});

describe("mentionsCredentials", () => {
  it.each([
    "أرسل لي كلمة المرور",
    "كلمه السر الخاصة بأبشر",
    "زودنا برمز التحقق",
    "الرقم السري",
    "send the OTP",
    "your password",
  ])("flags %s", (text) => {
    expect(mentionsCredentials(text)).toBe(true);
  });

  it.each(["تفويض المكتب في قوى", "Top service", "صور الإقامات"])("allows %s", (text) => {
    expect(mentionsCredentials(text)).toBe(false);
  });
});

describe("createRequestSchema", () => {
  const base = {
    mode: "public",
    accountId: uuid,
    serviceTypeId: uuid,
    city: "الرياض",
    urgency: "normal",
    description: "إصدار رخص عمل لعمال جدد",
    availableDocs: [],
  };

  it("accepts a valid public request", () => {
    expect(createRequestSchema.safeParse(base).success).toBe(true);
  });

  it("requires a description for public requests and a provider for direct ones", () => {
    expect(createRequestSchema.safeParse({ ...base, description: "قصير" }).success).toBe(false);
    expect(
      createRequestSchema.safeParse({ ...base, mode: "direct_quote", description: "" }).success,
    ).toBe(false);
    expect(
      createRequestSchema.safeParse({
        ...base,
        mode: "direct_quote",
        description: "",
        providerId: uuid,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown cities, contact info and credential requests", () => {
    expect(createRequestSchema.safeParse({ ...base, city: "لندن" }).success).toBe(false);
    expect(
      createRequestSchema.safeParse({ ...base, description: "تواصل 0551234567 الآن" }).success,
    ).toBe(false);
    expect(
      createRequestSchema.safeParse({ ...base, privateNotes: "كلمة المرور لحساب قوى هي" }).success,
    ).toBe(false);
  });
});

describe("bidSchema", () => {
  const base = {
    requestId: uuid,
    fee: "250",
    govFees: "",
    durationDays: "3",
    includes: "إصدار الرخصة ومتابعتها",
    needsFromClient: "تفويض في قوى",
  };

  it("converts fees to halalas and treats empty gov fees as zero", () => {
    const bid = bidSchema.parse(base);
    expect(bid.fee).toBe(25000);
    expect(bid.govFees).toBe(0);
  });

  it("rejects asking for passwords or OTP in needs", () => {
    expect(
      bidSchema.safeParse({ ...base, needsFromClient: "أرسل رمز التحقق من أبشر" }).success,
    ).toBe(false);
  });
});

describe("format helpers", () => {
  it("formats durations in Arabic", () => {
    expect(formatDuration(0)).toBe("أقل من دقيقة");
    expect(formatDuration(45)).toBe("45 دقيقة");
    expect(formatDuration(120)).toBe("ساعتان");
    expect(formatDuration(60 * 30)).toBe("يوم");
    expect(formatDuration(60 * 24 * 5)).toBe("5 أيام");
  });

  it("returns null once the deadline passed", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(timeLeft("2026-01-01T02:00:00Z", now)).toBe("ساعتان");
    expect(timeLeft("2025-12-31T23:59:00Z", now)).toBeNull();
    expect(timeLeft(null, now)).toBeNull();
  });
});

describe("rpcErrorMessage", () => {
  it("maps database error codes to Arabic messages", () => {
    expect(rpcErrorMessage({ message: "bids_limit_reached" })).toContain("العدد الأقصى");
    expect(rpcErrorMessage({ message: "something else" })).toContain("تعذّر");
  });
});
