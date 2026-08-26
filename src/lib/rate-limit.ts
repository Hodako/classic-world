// Anti-DDoS and Rate Limiting Guard

interface RateLimitRecord {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

const ipMap = new Map<string, RateLimitRecord>();
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [ip, record] of ipMap.entries()) {
    if (record.resetAt <= now && (!record.blockedUntil || record.blockedUntil <= now)) {
      ipMap.delete(ip);
    }
  }
}

export interface RateLimitOptions {
  limit?: number;        // Max requests in window
  windowMs?: number;     // Window duration in ms (default: 60s)
  blockDurationMs?: number; // Auto-ban duration if abusive (default: 5m)
}

/**
 * Checks if an IP is rate-limited or blocked.
 * Returns { success: boolean, remaining: number, resetInSeconds: number; blocked?: boolean }
 */
export function checkRateLimit(
  ip: string,
  options: RateLimitOptions = {}
): { success: boolean; remaining: number; resetInSeconds: number; blocked?: boolean } {
  cleanup();

  const limit = options.limit ?? 200;
  const windowMs = options.windowMs ?? 60 * 1000;
  const blockDurationMs = options.blockDurationMs ?? 5 * 60 * 1000;
  const now = Date.now();

  let record = ipMap.get(ip);

  // Check if currently blocked
  if (record?.blockedUntil && record.blockedUntil > now) {
    return {
      success: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.blockedUntil - now) / 1000),
      blocked: true,
    };
  }

  if (!record || record.resetAt <= now) {
    record = { count: 1, resetAt: now + windowMs };
    ipMap.set(ip, record);
    return {
      success: true,
      remaining: limit - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  record.count += 1;

  // Severe abuse trigger (2.5x over limit) -> Auto ban
  if (record.count > limit * 2.5) {
    record.blockedUntil = now + blockDurationMs;
    return {
      success: false,
      remaining: 0,
      resetInSeconds: Math.ceil(blockDurationMs / 1000),
      blocked: true,
    };
  }

  if (record.count > limit) {
    return {
      success: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  return {
    success: true,
    remaining: Math.max(0, limit - record.count),
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

/** Extract client IP from Next.js request headers */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "127.0.0.1";
}
