import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/rate-limit";

describe("RateLimiter", () => {
  it("blocks after the limit and recovers after the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("a", 100).ok).toBe(true);
    const blocked = rl.check("a", 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(1);
    expect(rl.check("b", 200).ok).toBe(true);
    expect(rl.check("a", 1001).ok).toBe(true);
  });

  it("caps the number of tracked keys", () => {
    const rl = new RateLimiter(1, 1000, 3);
    for (const k of ["a", "b", "c", "d"]) rl.check(k, 0);
    expect(rl.check("a", 0).ok).toBe(true); // "a" was evicted
  });
});
