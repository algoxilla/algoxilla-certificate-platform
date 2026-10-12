// Algoxilla Certificate Platform - Brevo Transactional Email Integration
// Communicates with Brevo REST API v3 (/v3/smtp/email) using server-side fetch.
// Enforces safety boundaries: Keeps API keys strictly on server; validates email headers; handles quotas.

import type { SendClaimLinkOptions, EmailServiceResult } from "./types";
import { generateClaimEmailContent } from "./template.ts";

const BREVO_API_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/**
 * Designated staging & test recipient inboxes permitted when NEXT_PUBLIC_APP_LIVE=false.
 * Substrings (like "test") or arbitrary domain matches are strictly NOT permitted.
 * Only exact lowercase matches against this designated allowlist are allowed.
 */
export const DEFAULT_DESIGNATED_TEST_INBOXES: readonly string[] = Object.freeze([
  "pilot.test@example.com",
  "staging-test@algoxilla.com",
  "devns.test@algoxilla.com",
  "jane.doe@example.com",
]);

export class BrevoEmailService {
  private apiKey?: string;
  private senderEmail: string = "certificates@algoxilla.com";
  private senderName: string = "Algoxilla Certifications";
  private programmaticAllowlist: Set<string> = new Set();

  constructor() {
    this.reloadConfig();
  }

  public reloadConfig(): void {
    this.apiKey = process.env.BREVO_API_KEY;
    const rawFrom = process.env.EMAIL_FROM || "Algoxilla Certifications <certificates@algoxilla.com>";
    
    // Parse sender name & email from "Name <email@domain.com>" format
    const match = rawFrom.match(/^(.*?)\s*<(.+@.+)>$/);
    if (match) {
      this.senderName = match[1].trim() || "Algoxilla Certifications";
      this.senderEmail = match[2].trim();
    } else {
      this.senderName = "Algoxilla Certifications";
      this.senderEmail = rawFrom.trim();
    }
  }

  /**
   * Registers an explicit test inbox to the server-side allowlist (used by automated tests & staging).
   */
  public addAllowlistedInbox(email: string): void {
    const clean = email.trim().toLowerCase();
    if (clean) this.programmaticAllowlist.add(clean);
  }

  /**
   * Removes an explicit test inbox from the programmatic allowlist.
   */
  public removeAllowlistedInbox(email: string): void {
    const clean = email.trim().toLowerCase();
    this.programmaticAllowlist.delete(clean);
  }

  /**
   * Clears all programmatic allowlist entries.
   */
  public resetAllowlist(): void {
    this.programmaticAllowlist.clear();
  }

  /**
   * Returns the complete set of designated test inboxes allowed in non-live mode.
   * Derived from:
   * 1. DEFAULT_DESIGNATED_TEST_INBOXES
   * 2. TEST_EMAIL_ALLOWLIST (or STAGING_ALLOWED_EMAILS) env var
   * 3. Programmatically registered test inboxes
   */
  public getAllowlist(): Set<string> {
    const list = new Set<string>();

    const envAllowlist = process.env.TEST_EMAIL_ALLOWLIST || process.env.STAGING_ALLOWED_EMAILS;
    if (envAllowlist && envAllowlist.trim()) {
      // When TEST_EMAIL_ALLOWLIST is explicitly defined, it is authoritative (exact allowlist)
      for (const item of envAllowlist.split(",")) {
        const clean = item.trim().toLowerCase();
        if (clean) list.add(clean);
      }
    } else {
      // Fallback defaults only when no environment allowlist is configured
      for (const email of DEFAULT_DESIGNATED_TEST_INBOXES) {
        list.add(email.trim().toLowerCase());
      }
    }

    for (const item of this.programmaticAllowlist) {
      list.add(item);
    }

    return list;
  }

  /**
   * Evaluates whether a recipient email address is explicitly allowlisted.
   * Note: Substrings like "test" or arbitrary domains are strictly NOT allowed.
   * Only exact matches against the server-side allowlist are permitted.
   */
  public isRecipientAllowlisted(email: string): boolean {
    const clean = email.trim().toLowerCase();
    return this.getAllowlist().has(clean);
  }

  /**
   * Dispatches a single-use claim link email via Brevo.
   */
  public async sendClaimLink(options: SendClaimLinkOptions): Promise<EmailServiceResult> {
    this.reloadConfig();
    const timestamp = new Date().toISOString();
    const { subject, htmlContent, textContent } = generateClaimEmailContent(options);

    const targetEmail = options.toEmail.trim().toLowerCase();
    const isLive = process.env.NEXT_PUBLIC_APP_LIVE === "true";

    // CRITICAL SAFETY GUARD: When live mode is false, ONLY allowlisted designated test inboxes are permitted.
    // Every other recipient is suppressed without a network request, even if their address contains "test".
    if (!isLive) {
      const isAllowlisted = this.isRecipientAllowlisted(targetEmail);
      if (!isAllowlisted) {
        console.warn(
          `[SAFETY GUARD] Suppressed Brevo dispatch to non-allowlisted email "${targetEmail}" because NEXT_PUBLIC_APP_LIVE is false.`
        );
        return {
          success: true,
          messageId: `simulated-guard-${Date.now()}`,
          provider: "SAFETY_SIMULATED",
          timestamp,
        };
      }
    }

    // If BREVO_API_KEY is not configured or in local sandbox/test mode without an active key
    const activeApiKey = this.apiKey;
    const isPlaceholderKey =
      !activeApiKey ||
      activeApiKey.includes("replace-with") ||
      activeApiKey.length < 20;

    if (isPlaceholderKey || !activeApiKey) {
      return {
        success: true,
        messageId: `mock-brevo-${Date.now()}`,
        provider: "MOCK_TEST",
        timestamp,
      };
    }

    try {
      const payload = {
        sender: {
          name: this.senderName,
          email: this.senderEmail,
        },
        to: [
          {
            email: targetEmail,
            name: options.recipientName.trim(),
          },
        ],
        subject,
        htmlContent,
        textContent,
      };

      const response = await fetch(BREVO_API_ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": activeApiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorDetail = `Brevo HTTP error ${response.status}: ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson.message) {
            errorDetail = `Brevo error: ${errJson.message} (code: ${errJson.code || response.status})`;
          }
        } catch {
          // ignore parsing error
        }

        console.error("Brevo dispatch error:", errorDetail);
        return {
          success: false,
          error: errorDetail,
          provider: "BREVO",
          timestamp,
        };
      }

      const resData = (await response.json()) as { messageId?: string };
      return {
        success: true,
        messageId: resData.messageId || `brevo-${Date.now()}`,
        provider: "BREVO",
        timestamp,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown network error";
      console.error("Brevo network exception:", errMsg);
      return {
        success: false,
        error: errMsg,
        provider: "BREVO",
        timestamp,
      };
    }
  }
}

export const brevoService = new BrevoEmailService();
