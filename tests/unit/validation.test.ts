import { describe, expect, it } from "vitest";
import {
  identifierSchema,
  normalizeSaudiPhone,
  onboardingSchema,
  signUpSchema,
} from "@/lib/auth/validation";

describe("normalizeSaudiPhone", () => {
  it.each([
    ["0501234567", "+966501234567"],
    ["501234567", "+966501234567"],
    ["966501234567", "+966501234567"],
    ["+966 50 123 4567", "+966501234567"],
    ["00966501234567", "+966501234567"],
    ["٠٥٠١٢٣٤٥٦٧", "+966501234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeSaudiPhone(input)).toBe(expected);
  });

  it.each(["0401234567", "05012345", "+201001234567", "abc"])("rejects %s", (input) => {
    expect(normalizeSaudiPhone(input)).toBeNull();
  });
});

describe("identifierSchema", () => {
  it("detects email", () => {
    expect(identifierSchema.parse(" Name@Example.com ")).toEqual({
      kind: "email",
      email: "name@example.com",
    });
  });

  it("detects phone", () => {
    expect(identifierSchema.parse("0551112222")).toEqual({ kind: "phone", phone: "+966551112222" });
  });

  it("rejects malformed email and phone", () => {
    expect(identifierSchema.safeParse("a@b").success).toBe(false);
    expect(identifierSchema.safeParse("123").success).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("requires a password of at least 8 characters", () => {
    const result = signUpSchema.safeParse({
      fullName: "سارة",
      identifier: "0551112222",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("accepts provider and individual requester", () => {
    expect(onboardingSchema.safeParse({ role: "provider" }).success).toBe(true);
    expect(
      onboardingSchema.safeParse({ role: "requester", accountType: "individual" }).success,
    ).toBe(true);
  });

  it("requires establishment name and a 10-digit CR", () => {
    expect(
      onboardingSchema.safeParse({
        role: "requester",
        accountType: "establishment",
        establishmentName: "مؤسسة",
        crNumber: "12345",
      }).success,
    ).toBe(false);
    expect(
      onboardingSchema.safeParse({
        role: "requester",
        accountType: "establishment",
        establishmentName: "مؤسسة",
        crNumber: "1010123456",
      }).success,
    ).toBe(true);
  });

  it("never accepts admin", () => {
    expect(onboardingSchema.safeParse({ role: "admin" }).success).toBe(false);
  });
});
