export type LimitResult = { ok: true; retryAfterMs: 0 } | { ok: false; retryAfterMs: number };

export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function check(key: string, now = Date.now()): LimitResult {
    const kept = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
    if (kept.length >= max) {
      hits.set(key, kept);
      return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - kept[0])) };
    }
    kept.push(now);
    hits.set(key, kept);
    return { ok: true, retryAfterMs: 0 };
  };
}

/** 40 requests per minute per IP, shared by the chat, lookup, and PDF routes. */
const limit = createRateLimiter(40, 60_000);

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitResponse(request: Request): Response | null {
  const result = limit(clientKey(request));
  if (result.ok) return null;
  const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return Response.json(
    { error: "Too many requests. Wait a minute and try again." },
    { status: 429, headers: { "Retry-After": String(seconds), "Cache-Control": "no-store" } },
  );
}
