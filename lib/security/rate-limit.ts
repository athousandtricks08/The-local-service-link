import { createServiceClient } from '@/lib/supabase/server';

type Bucket = {
  tokens: number;
  lastRefill: number;
};

const LOCAL_BUCKETS = new Map<string, Bucket>();
const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_RATE = 1;

/**
 * Token-bucket rate limiter.
 *
 * Uses a module-level Map for best-effort protection against telco callback storms.
 * In serverless, each instance has its own map — this provides per-instance protection.
 * For true cross-instance limiting, the database is the source of truth; this is
 * the first line of defense to reject storms before they reach the DB.
 */
export function rateLimit(
  key: string,
  capacity: number = DEFAULT_CAPACITY,
  refillRatePerSec: number = DEFAULT_REFILL_RATE,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = LOCAL_BUCKETS.get(key);

  if (!bucket) {
    LOCAL_BUCKETS.set(key, {
      tokens: capacity - 1,
      lastRefill: now,
    });
    return { allowed: true, remaining: capacity - 1 };
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRatePerSec);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    LOCAL_BUCKETS.set(key, bucket);
    return { allowed: false, remaining: 0 };
  }

  bucket.tokens -= 1;
  LOCAL_BUCKETS.set(key, bucket);
  return { allowed: true, remaining: Math.floor(bucket.tokens) };
}

export const RATE_LIMIT_HEADERS = {
  noStore: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
};

export async function isIpAllowed(ip: string): Promise<boolean> {
  const allowedRaw = process.env.WEBHOOK_IP_ALLOWLIST;
  if (!allowedRaw) return true;
  const allowed = allowedRaw.split(',').map((s) => s.trim());
  return allowed.includes(ip);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '0.0.0.0';
}
