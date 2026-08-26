import { NextRequest } from "next/server";

// In-memory sliding window limiter. Good enough to deter casual spam on a
// single instance deployment; it resets on restart and isn't shared across
// instances, so it's not a defense against a determined/distributed attacker.
const buckets = new Map<string, number[]>();

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return false;
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
