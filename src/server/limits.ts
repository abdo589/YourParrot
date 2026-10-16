import "server-only";
import { RateLimiter } from "@/lib/rate-limit";

const MIN = 60_000;

// Kept on globalThis so dev hot-reloads don't reset the counters.
const g = globalThis as unknown as { __ypLimits?: Record<string, RateLimiter> };

export const limits = (g.__ypLimits = {
  checkout: new RateLimiter(5, 10 * MIN),
  contact: new RateLimiter(3, 10 * MIN),
  login: new RateLimiter(5, 15 * MIN),
  webhook: new RateLimiter(60, MIN),
  orderView: new RateLimiter(30, MIN),
  ...g.__ypLimits,
});
