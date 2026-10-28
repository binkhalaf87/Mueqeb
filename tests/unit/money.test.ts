import { describe, expect, it } from "vitest";
import { formatHalalas, halalasToInput, parseSarToHalalas } from "@/lib/money";

describe("parseSarToHalalas", () => {
  it.each([
    ["150", 15000],
    ["150.5", 15050],
    ["150.05", 15005],
    ["0.99", 99],
    ["١٥٠", 15000],
    ["150,25", 15025],
    [" 75 ", 7500],
  ])("%s → %d", (input, expected) => {
    expect(parseSarToHalalas(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "-5", "1e3", "10000000"])("rejects %s", (input) => {
    expect(parseSarToHalalas(input)).toBeNull();
  });

  it("never produces fractional halalas", () => {
    for (const v of ["0.1", "0.2", "19.99", "1.15"]) {
      expect(Number.isInteger(parseSarToHalalas(v))).toBe(true);
    }
    expect(parseSarToHalalas("1.15")).toBe(115);
  });
});

describe("formatHalalas", () => {
  it("formats riyals and halalas", () => {
    expect(formatHalalas(15000)).toBe("150 ر.س");
    expect(formatHalalas(15050)).toBe("150.50 ر.س");
    expect(formatHalalas(123456700)).toBe("1,234,567 ر.س");
  });

  it("round-trips through the input format", () => {
    for (const h of [100, 15000, 15050, 99]) {
      expect(parseSarToHalalas(halalasToInput(h))).toBe(h);
    }
  });
});
