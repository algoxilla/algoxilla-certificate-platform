// Algoxilla Certificate Platform - Supabase & PostgreSQL Client Manager
// Safely provides server-side Supabase admin client and PostgreSQL pool.
// Enforces zero secret leakage and isolates service role privileges to server only.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;

let supabaseAdminClient: SupabaseClient | null = null;
let pgPool: pg.Pool | null = null;

export function isSupabaseConfigured(): boolean {
  const hasDbUrl = Boolean(
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
  const hasSupabaseSdk = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return hasDbUrl || hasSupabaseSdk;
}

/**
 * Returns a Supabase admin client initialized with the server-only service_role key.
 * Throws an error if credentials are missing.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}

/**
 * Safely sanitizes a PostgreSQL connection URL.
 * Automatically percent-encodes unencoded special characters in the password component
 * (such as spaces, slashes, ampersands) to prevent WHATWG URL parsing errors.
 */
export function sanitizePostgresUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@]+)$/);
  if (!match) return trimmed;
  const [, scheme, user, rawPassword, rest] = match;
  let cleanPassword = rawPassword;
  try {
    cleanPassword = decodeURIComponent(rawPassword);
  } catch {
    cleanPassword = rawPassword;
  }
  const encodedPassword = encodeURIComponent(cleanPassword);
  return `${scheme}${user}:${encodedPassword}@${rest}`;
}

/**
 * Returns a pooled PostgreSQL connection client.
 * Configured for Supabase transaction pooler (port 6543) or direct connection (port 5432).
 */
export function getPostgresPool(): pg.Pool {
  if (pgPool) {
    return pgPool;
  }

  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!rawUrl) {
    throw new Error(
      "PostgreSQL pool requires DATABASE_URL, DIRECT_URL, or POSTGRES_URL environment variable."
    );
  }

  const connectionString = sanitizePostgresUrl(rawUrl);

  pgPool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return pgPool;
}

/**
 * Resets cached clients (used in tests).
 */
export async function closeSupabaseClients(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  supabaseAdminClient = null;
}
