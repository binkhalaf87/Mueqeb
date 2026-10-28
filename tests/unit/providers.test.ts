import { describe, expect, it } from "vitest";
import { isEditableStage, providerStage } from "@/lib/providers/constants";
import {
  providerProfileSchema,
  providerServiceSchema,
  reviewSchema,
  validateDocumentFile,
} from "@/lib/providers/validation";

describe("providerStage", () => {
  it("distinguishes draft from under review", () => {
    expect(providerStage({ verification_status: "pending", submitted_at: null })).toBe("draft");
    expect(providerStage({ verification_status: "pending", submitted_at: "2026-01-01" })).toBe(
      "under_review",
    );
    expect(providerStage({ verification_status: "approved", submitted_at: "2026-01-01" })).toBe(
      "approved",
    );
  });

  it("only draft and rejected are editable", () => {
    expect(isEditableStage("draft")).toBe(true);
    expect(isEditableStage("rejected")).toBe(true);
    expect(isEditableStage("under_review")).toBe(false);
    expect(isEditableStage("approved")).toBe(false);
    expect(isEditableStage("suspended")).toBe(false);
  });
});

describe("providerProfileSchema", () => {
  const valid = {
    officeName: "مكتب الاختبار",
    crNumber: "1010123456",
    municipalLicenseNumber: "40021987",
    cities: ["الرياض"],
    bio: "",
  };

  it("accepts a valid profile and nulls empty bio", () => {
    const result = providerProfileSchema.parse(valid);
    expect(result.bio).toBeNull();
  });

  it("normalises Arabic digits in CR", () => {
    expect(providerProfileSchema.parse({ ...valid, crNumber: "١٠١٠١٢٣٤٥٦" }).crNumber).toBe(
      "1010123456",
    );
  });

  it("requires at least one known city", () => {
    expect(providerProfileSchema.safeParse({ ...valid, cities: [] }).success).toBe(false);
    expect(providerProfileSchema.safeParse({ ...valid, cities: ["أتلانتس"] }).success).toBe(false);
  });
});

describe("providerServiceSchema", () => {
  it("converts SAR to integer halalas", () => {
    const result = providerServiceSchema.parse({
      serviceTypeId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      fee: "180.50",
      durationDays: "3",
      notes: "",
    });
    expect(result.fee).toBe(18050);
    expect(result.durationDays).toBe(3);
    expect(result.notes).toBeNull();
  });

  it("rejects invalid fee and duration", () => {
    const base = { serviceTypeId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", notes: "" };
    expect(providerServiceSchema.safeParse({ ...base, fee: "0", durationDays: "3" }).success).toBe(
      false,
    );
    expect(
      providerServiceSchema.safeParse({ ...base, fee: "100", durationDays: "0" }).success,
    ).toBe(false);
  });
});

describe("validateDocumentFile", () => {
  it("accepts PDF/JPG/PNG up to 5MB", () => {
    expect(validateDocumentFile(new File(["x"], "a.pdf", { type: "application/pdf" }))).toBeNull();
    expect(validateDocumentFile(new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
  });

  it("rejects other types, empty and oversized files", () => {
    expect(
      validateDocumentFile(new File(["x"], "a.exe", { type: "application/x-msdownload" })),
    ).not.toBeNull();
    expect(validateDocumentFile(new File([], "a.pdf", { type: "application/pdf" }))).not.toBeNull();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.pdf", {
      type: "application/pdf",
    });
    expect(validateDocumentFile(big)).not.toBeNull();
    expect(validateDocumentFile("not a file")).not.toBeNull();
  });
});

describe("reviewSchema", () => {
  const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  it("requires a reason to reject or suspend", () => {
    expect(reviewSchema.safeParse({ providerId: id, action: "approve" }).success).toBe(true);
    expect(reviewSchema.safeParse({ providerId: id, action: "reject" }).success).toBe(false);
    expect(reviewSchema.safeParse({ providerId: id, action: "suspend", reason: " " }).success).toBe(
      false,
    );
    expect(
      reviewSchema.safeParse({ providerId: id, action: "reject", reason: "السجل منتهي" }).success,
    ).toBe(true);
  });
});
