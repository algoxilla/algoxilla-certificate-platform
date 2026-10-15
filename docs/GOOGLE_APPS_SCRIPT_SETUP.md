# Algoxilla Certificate Platform — Google Forms Webhook Setup Guide

This document describes how to configure Google Forms and Google Apps Script to synchronize participant registrations into the Algoxilla Certificate Platform in real time with automatic retry and replay protection.

---

## 1. Prerequisites & Environment Variables

Ensure the following environment variable is configured in Vercel / hosting environment:

```bash
GOOGLE_FORMS_WEBHOOK_SECRET="<generate-random-32-byte-hex-string>"
```

*(In production, `GOOGLE_FORMS_WEBHOOK_SECRET` is strictly required and fails closed if omitted).*

The webhook endpoint URL is:
```
https://verify.algoxilla.com/api/integrations/google-forms
```

---

## 2. Invariant & Security Safeguards

- **No Premature Certificates:** Registering via Google Forms **never** issues a certificate or marks attendance (`attendance_confirmed` is strictly set to `0`, and eligibility is `PENDING_ORGANIZER_APPROVAL`).
- **No Email Dispatches:** No claim links or participant emails are sent upon form registration.
- **Timing Attack Defense:** Header verification uses constant-time byte comparison (`crypto.timingSafeEqual`).
- **Replay Protection:** Submissions require a fresh request timestamp within 5 minutes of server time.
- **Idempotency:** Stable Google Forms `responseId` prevents duplicate records upon re-submissions or network retries.
- **Edit Tracking:** If a participant edits their submitted response in Google Forms, the platform updates their registered name and records an immutable audit log entry.
- **Formula Injection Defense:** Form answers beginning with `=`, `+`, `-`, or `@` are safely sanitized.

---

## 3. Google Apps Script Implementation

### Option A: Direct Form Script (Recommended)
1. Open your Google Form in Google Drive.
2. Click the three dots menu (top right) -> **Script editor**.
3. Replace the editor contents with the code below:

```javascript
/**
 * Algoxilla Certificate Platform - Google Forms Live Webhook Trigger
 * Sends responses to Algoxilla API with exponential backoff retries.
 */

const CONFIG = {
  ENDPOINT_URL: "https://verify.algoxilla.com/api/integrations/google-forms",
  WEBHOOK_SECRET: "YOUR_GOOGLE_FORMS_WEBHOOK_SECRET",
  EVENT_CODE: "ALGOTHON26", // Target event code
  MAX_RETRIES: 3,
};

function onFormSubmit(e) {
  var response = e.response;
  var responseId = response.getId();
  var timestamp = response.getTimestamp().toISOString();
  var itemResponses = response.getItemResponses();

  var email = response.getRespondentEmail() || "";
  var fullName = "";
  var phone = "";
  var answers = {};

  for (var i = 0; i < itemResponses.length; i++) {
    var title = itemResponses[i].getItem().getTitle();
    var val = itemResponses[i].getResponse();
    answers[title] = val;
    var lowerTitle = title.toLowerCase();

    if (!email && (lowerTitle.includes("email") || lowerTitle.includes("mail"))) {
      email = String(val).trim();
    } else if (!fullName && (lowerTitle.includes("name") || lowerTitle.includes("full name"))) {
      fullName = String(val).trim();
    } else if (!phone && (lowerTitle.includes("phone") || lowerTitle.includes("mobile") || lowerTitle.includes("whatsapp"))) {
      phone = String(val).trim();
    }
  }

  var payload = {
    responseId: responseId,
    formSubmittedAt: timestamp,
    timestamp: timestamp,
    email: email,
    fullName: fullName,
    phone: phone,
    eventId: CONFIG.EVENT_CODE,
    answers: answers
  };

  sendWithRetry(payload, 0);
}

function sendWithRetry(payload, attempt) {
  // Generate fresh request timestamp immediately before dispatch for replay protection
  var requestTimestamp = new Date().toISOString();

  var headers = {
    "Content-Type": "application/json",
    "x-integration-secret": CONFIG.WEBHOOK_SECRET,
    "x-request-timestamp": requestTimestamp,
    "x-submission-timestamp": requestTimestamp
  };

  var options = {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(CONFIG.ENDPOINT_URL, options);
    var statusCode = response.getResponseCode();
    var body = response.getContentText();

    if (statusCode >= 200 && statusCode < 300) {
      Logger.log("✅ Successfully synced response: " + payload.responseId);
      return;
    }

    Logger.warn("⚠️ Server returned HTTP " + statusCode + ": " + body);
    if (attempt < CONFIG.MAX_RETRIES && (statusCode >= 500 || statusCode === 429)) {
      Utilities.sleep(Math.pow(2, attempt) * 1000);
      sendWithRetry(payload, attempt + 1);
    }
  } catch (err) {
    Logger.error("❌ Network error: " + err.message);
    if (attempt < CONFIG.MAX_RETRIES) {
      Utilities.sleep(Math.pow(2, attempt) * 1000);
      sendWithRetry(payload, attempt + 1);
    }
  }
}
```

4. Set up the installable trigger:
   - Click the clock icon (**Triggers**) on the left toolbar.
   - Click **Add Trigger** (bottom right).
   - Choose which function to run: `onFormSubmit`
   - Select event source: `From form`
   - Select event type: `On form submit`
   - Failure notification settings: `Notify me daily` or `immediately`
   - Click **Save** and grant the required permissions (`UrlFetchApp` and `FormsApp`).

---

## 4. Reconciling Historical or Missed Responses

If the webhook was disabled or network interruptions occurred, organizers can run a full reconcile sync:

1. **Via CLI:**
   Export responses as CSV or JSON from Google Forms / Sheets, and run:
   ```bash
   node scripts/import-google-forms.mjs responses.csv --dry-run
   node scripts/import-google-forms.mjs responses.csv --commit
   ```

2. **Via Webhook Batch Reconcile API:**
   Send a `POST` request with header `x-reconcile: true` and the batch array in the request body.
