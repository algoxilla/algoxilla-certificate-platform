// Algoxilla Certificate Platform - Unified Database Client & Persistence Manager
// Enforces strict production fail-closed rules (Rule 9): Never silently fall back to mock data in production.
// Automatically routes to Supabase PostgreSQL when credentials exist, and falls back to local SQLite in development.

import fs from "node:fs";
import path from "node:path";
import { CertificateRepository } from "./repository.ts";
import { SupabaseCertificateRepository } from "./supabaseRepository.ts";
import { isSupabaseConfigured } from "./supabaseClient.ts";
export { isSupabaseConfigured };

export class DatabaseUnavailableError extends Error {
  public code: string;
  constructor(message: string, code = "DATABASE_UNAVAILABLE") {
    super(message);
    this.name = "DatabaseUnavailableError";
    this.code = code;
  }
}

let sqliteInstance: CertificateRepository | null = null;
let supabaseInstance: SupabaseCertificateRepository | null = null;

export function isProductionMode(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_APP_LIVE === "true"
  );
}

/**
 * Returns the active CertificateRepository.
 * 
 * Safety Rule 9:
 * If the application is running in production mode (NODE_ENV=production or NEXT_PUBLIC_APP_LIVE=true)
 * and no persistent production database (DATABASE_URL or Supabase) is configured, this function THROWS
 * a DatabaseUnavailableError instead of silently falling back to mock or ephemeral data.
 */
export function getCertificateRepository(): CertificateRepository | SupabaseCertificateRepository {
  const isProd = isProductionMode();
  const hasSupabase = isSupabaseConfigured();

  // If Supabase / PostgreSQL is configured, return the authoritative Supabase repository
  if (hasSupabase) {
    if (!supabaseInstance) {
      supabaseInstance = new SupabaseCertificateRepository();
    }
    return supabaseInstance;
  }

  // In production mode, an external persistent database (Supabase PostgreSQL) MUST be configured.
  // Falling back to SQLite or mock data in production is strictly prohibited.
  if (isProd) {
    throw new DatabaseUnavailableError(
      "Production database is not configured. DATABASE_URL or Supabase credentials are missing. Certificate operations are paused for safety.",
      "PRODUCTION_DB_UNCONFIGURED"
    );
  }

  // Local development / testing mode with SQLite
  if (!sqliteInstance) {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {
        // Fall back to memory in sandboxes where dataDir cannot be written
      }
    }
    const dbPath = path.join(dataDir, "certificates.db");
    sqliteInstance = new CertificateRepository(dbPath);
  }

  return sqliteInstance;
}

/**
 * Resets the cached database instances (used by test suites).
 */
export function resetDatabaseClientForTesting(): void {
  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch {
      // ignore
    }
    sqliteInstance = null;
  }
  supabaseInstance = null;
}
