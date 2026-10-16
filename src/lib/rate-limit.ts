/**
 * Fixed-window-with-sliding-log rate limiter kept in memory.
 * Good for a single Node process; use Redis/Upstash when running several instances.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Records a hit and returns whether it is allowed plus seconds until retry. */
  check(key: string, now = Date.now()): { ok: boolean; retryAfter: number } {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfter: Math.ceil((recent[0] + this.windowMs - now) / 1000) };
    }

    recent.push(now);
    this.hits.delete(key); // re-insert to keep Map ordered by recency
    this.hits.set(key, recent);
    this.evict();
    return { ok: true, retryAfter: 0 };
  }

  private evict() {
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}
