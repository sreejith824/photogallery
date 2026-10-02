import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// Rate limits for public endpoints that do real work (database writes, emails).
// Fails open: without Upstash configured, or if Redis errors, requests are
// allowed, so a Redis outage can't take the site down.

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

function limiter(requests: number, window: `${number} ${"s" | "m" | "h" | "d"}`, prefix: string) {
  return redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(requests, window), prefix })
    : null;
}

export const limits = {
  // Access-request form: per visitor IP, and per email + photo
  accessRequestByIp: limiter(5, "1 h", "rl:access-request:ip"),
  accessRequestByEmail: limiter(3, "1 d", "rl:access-request:email"),
  // Magic-link validation: per IP, slows down token guessing
  shareValidateByIp: limiter(20, "1 m", "rl:share-validate:ip"),
};

export function clientIp(request: NextRequest): string {
  // On Vercel the first x-forwarded-for entry is the client
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Returns seconds until the caller may retry, or null when allowed
export async function checkLimit(
  limit: Ratelimit | null,
  key: string
): Promise<number | null> {
  if (!limit) return null;
  try {
    const { success, reset } = await limit.limit(key);
    return success ? null : Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  } catch (error) {
    console.error("Rate limit check failed, allowing request:", error);
    return null;
  }
}

export function tooManyRequests(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
