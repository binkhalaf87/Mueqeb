import { describe, expect, it } from "vitest";
import { homePathForRole, isAuthPath, isProtectedPath, safeNextPath } from "@/lib/auth/routes";

describe("homePathForRole", () => {
  it("maps each role to its own area", () => {
    expect(homePathForRole("requester")).toBe("/dashboard/requester");
    expect(homePathForRole("provider")).toBe("/dashboard/provider");
    expect(homePathForRole("admin")).toBe("/admin");
    expect(homePathForRole(null)).toBe("/onboarding");
  });
});

describe("path guards", () => {
  it("marks dashboard, admin and onboarding as protected", () => {
    expect(isProtectedPath("/dashboard/provider")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/onboarding")).toBe(true);
    expect(isProtectedPath("/administrator")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });

  it("recognises auth pages", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/signup")).toBe(true);
    expect(isAuthPath("/loginx")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("allows internal paths only", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
