// Algoxilla Certificate Platform - Transactional Email Template Generator
// Produces accessible, mobile-responsive HTML and plaintext emails matching Algoxilla brand guidelines.

import type { SendClaimLinkOptions } from "./types";

export function generateClaimEmailContent(options: SendClaimLinkOptions): {
  subject: string;
  htmlContent: string;
  textContent: string;
} {
  const { recipientName, claimUrl, expiresMinutes = 15 } = options;
  const subject = "Your Algothon’26 Official Certificate Claim Link";

  const textContent = `
Hello ${recipientName},

Your official participation credential for Algothon’26 (organized by Algoxilla) is ready to claim.

Click the secure link below to verify your identity and download your personalized A4 Landscape certificate:
${claimUrl}

Important Security Notice:
- This is a single-use verification link.
- For your protection, this link expires in ${expiresMinutes} minutes.
- If you did not request this link, no action is needed.

Need assistance or a name correction?
You can request corrections directly through the verification portal once authenticated.

Best regards,
Algoxilla Organizing Team
Build • Collaborate • Solve • Grow
https://algoxilla.com
`.trim();

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5; }
    .container { max-width: 580px; margin: 40px auto; background-color: #121215; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { background-color: #09090b; border-bottom: 2px solid #dc2626; padding: 24px 32px; text-align: center; }
    .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #ef4444; margin: 0; }
    .tagline { font-size: 10px; font-family: monospace; letter-spacing: 2px; color: #a1a1aa; text-transform: uppercase; margin-top: 4px; }
    .body { padding: 32px; }
    .title { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px; }
    .greeting { font-size: 15px; color: #d4d4d8; line-height: 1.6; margin-bottom: 20px; }
    .cta-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #dc2626; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4); }
    .btn:hover { background-color: #b91c1c; }
    .notice-box { background-color: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 16px; font-size: 12px; color: #a1a1aa; margin-top: 24px; line-height: 1.5; }
    .notice-box strong { color: #f4f4f5; }
    .link-fallback { font-size: 11px; color: #71717a; word-break: break-all; margin-top: 16px; }
    .link-fallback a { color: #ef4444; text-decoration: underline; }
    .footer { background-color: #09090b; border-top: 1px solid #1f1f23; padding: 20px 32px; font-size: 11px; color: #71717a; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">ALGOXILLA</div>
      <div class="tagline">Credentials & Certification Platform</div>
    </div>
    <div class="body">
      <h1 class="title">Algothon’26 Certificate Claim</h1>
      <p class="greeting">
        Hello <strong>${recipientName}</strong>,
      </p>
      <p class="greeting">
        Your verified participation credential for <strong>Algothon’26</strong> (National Level Hackathon) has been approved and is ready for download.
      </p>
      <div class="cta-container">
        <a href="${claimUrl}" class="btn" target="_blank" rel="noopener noreferrer">
          Claim Your Official Certificate &rarr;
        </a>
      </div>
      <div class="notice-box">
        <strong>Security & Validity Notice:</strong><br>
        &bull; This single-use claim link is tied to your registered email.<br>
        &bull; This link automatically expires in <strong>${expiresMinutes} minutes</strong>.<br>
        &bull; If you did not request this credential, you can safely ignore this email.
      </div>
      <div class="link-fallback">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${claimUrl}" target="_blank" rel="noopener noreferrer">${claimUrl}</a>
      </div>
    </div>
    <div class="footer">
      &copy; 2026 Algoxilla Certificate Platform. All rights reserved.<br>
      Algothon’26 &bull; Authorized by Co-Founders Dev Raj & Aditya Raj
    </div>
  </div>
</body>
</html>
`.trim();

  return {
    subject,
    htmlContent,
    textContent,
  };
}
