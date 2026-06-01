// Server-only — never import in client components or pages marked 'use client'.
// Same constraint as src/lib/supabase/server.ts.
// Rule 05 pattern applied to Redis: this is the ONLY instantiation point.

import { Redis } from '@upstash/redis';

const url   = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url)   throw new Error('Missing env var: UPSTASH_REDIS_REST_URL');
if (!token) throw new Error('Missing env var: UPSTASH_REDIS_REST_TOKEN');

export const redis = Redis.fromEnv();
