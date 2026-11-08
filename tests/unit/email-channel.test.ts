import { describe, expect, it, vi } from "vitest";
import { isUndeliverableAddress, ResendEmailChannel } from "@/lib/notifications/email";

const notification = (email: string) => ({
  kind: "test",
  title: "عنوان",
  body: "نص",
  url: null,
  recipient: { name: "مستخدم", email, phone: null },
});

describe("reserved test domains", () => {
  it("detects addresses that can never receive mail", () => {
    for (const email of [
      "admin@mueqeb.test",
      "a@x.example",
      "a@example.com",
      "a@foo.invalid",
      "a@localhost",
    ]) {
      expect(isUndeliverableAddress(email)).toBe(true);
    }
    for (const email of ["owner@mueqeb.com", "user@gmail.com", "x@testing.sa", "a@mytest.com"]) {
      expect(isUndeliverableAddress(email)).toBe(false);
    }
  });

  it("Resend skips them without calling the API, and sends real addresses", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "email_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const channel = new ResendEmailChannel("re_test_key", "Mueqeb <no-reply@mueqeb.com>");

    expect(await channel.send(notification("establishment@mueqeb.test"))).toEqual({
      status: "skipped",
      reason: "reserved_domain",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    expect(await channel.send(notification("owner@example.sa"))).toEqual({ status: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
