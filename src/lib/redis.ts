import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the
// environment (the exact names Upstash's own console and Vercel's Marketplace
// integration both expose). Throws clearly at first use if they're missing,
// rather than silently falling back to in-memory storage that resets on
// every deploy/restart - the exact problem this replaces.
export const redis = Redis.fromEnv();
