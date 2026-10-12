// Algoxilla Certificate Platform - Email Service Types & Contracts

export interface SendClaimLinkOptions {
  toEmail: string;
  recipientName: string;
  claimUrl: string;
  expiresMinutes?: number; // default: 15
}

export interface EmailServiceResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: "BREVO" | "MOCK_TEST" | "SAFETY_SIMULATED";
  timestamp: string;
}
