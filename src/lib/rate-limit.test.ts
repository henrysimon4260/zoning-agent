import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

describe("rate limit", () => {
  it("allows a burst up to the cap, then opens the window again", () => {
    const check = createRateLimiter(2, 1000);
    expect(check("a", 0).ok).toBe(true);
    expect(check("a", 10).ok).toBe(true);
    const blocked = check("a", 20);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBe(980);
    expect(check("b", 20).ok).toBe(true);
    expect(check("a", 1001).ok).toBe(true);
  });

  it("reads the first forwarded address", () => {
    const request = new Request("http://localhost/api/chat", {
      headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
    });
    expect(clientKey(request)).toBe("203.0.113.4");
  });
});
