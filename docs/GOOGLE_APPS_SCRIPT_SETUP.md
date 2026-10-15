# Algoxilla Certificate Platform — Google Forms Webhook Setup Guide

This document describes how to configure Google Forms / Google Sheets and Google Apps Script to synchronize participant registrations into the Algoxilla Certificate Platform in real time with automatic retry, replay protection, and idempotency.

---

## 1. Production Endpoint & Environment Variables

### A. Vercel Hosting Environment
The following environment variable must be set in Vercel Production (`devns181-7267s-projects/algoxilla-certificate-platform-1`):
* `GOOGLE_FORMS_WEBHOOK_SECRET` — Strong random secret (Configured as Secret in Production).
* `APP_LIVE` = `false`
* `NEXT_PUBLIC_APP_LIVE` = `false`

The deployed production webhook endpoint URL is:
```
https://algoxilla-certificate-platform-1.vercel.app/api/integrations/google-forms
```

---

## 2. Invariant & Security Safeguards

- **No Premature Certificates:** Registering via Google Forms **never** issues a certificate or marks attendance (`attendance_confirmed` is strictly set to `0`, and eligibility is `PENDING_ORGANIZER_APPROVAL`).
- **No Email Dispatches:** No claim links or participant emails are sent upon form registration.
- **Timing Attack Defense:** Header verification uses constant-time byte comparison (`crypto.timingSafeEqual`).
- **Replay Protection:** Submissions require a fresh request timestamp within 5 minutes of server time (`x-request-timestamp`).
- **Idempotency:** Stable Google Forms `responseId` (or deterministic spreadsheet row identifier) prevents duplicate records upon re-submissions or network retries.
- **Edit Tracking:** If a participant edits their submitted response, the platform updates their registered name and records an immutable audit log entry.
- **Formula Injection Defense:** Form answers beginning with `=`, `+`, `-`, or `@` are safely sanitized.

---

## 3. Google Apps Script Implementation

This script supports **both** trigger types:
1. **Spreadsheet Trigger (`From spreadsheet → On form submit`)** — When responses are linked to a Google Sheet.
2. **Form Trigger (`From form → On form submit`)** — When the script is attached directly to the Google Form.

### Step 1: Add Script to Sheet or Form
1. Open the connected Google Sheet (or Google Form).
2. Go to **Extensions > Apps Script**.
3. Replace all code in the script editor with the code below:

```javascript
/**
 * Algoxilla Certificate Platform - Universal Google Forms Webhook Integration
 * Compatible with BOTH "From spreadsheet" and "From form" OnFormSubmit triggers.
 */

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    ENDPOINT_URL: props.getProperty("WEBHOOK_URL") || "https://algoxilla-certificate-platform-1.vercel.app/api/integrations/google-forms",
    WEBHOOK_SECRET: props.getProperty("WEBHOOK_SECRET") || props.getProperty("GOOGLE_FORMS_WEBHOOK_SECRET") || "",
    EVENT_ID: props.getProperty("EVENT_ID") || props.getProperty("EVENT_CODE") || "ALGOTHON26",
    MAX_RETRIES: 3,
  };
}

/**
 * Prioritizes participant full name over non-participant names (e.g. college/team)
 */
function extractCandidateFields(answersDict) {
  var EXCLUDE_NAME_WORDS = [
    "college", "institute", "institution", "university", "school",
    "team", "organization", "company", "club", "dept", "department",
    "project", "guide", "mentor", "parent", "father", "mother"
  ];
  var bestName = { val: "", score: 0 };
  var bestEmail = { val: "", score: 0 };
  var bestPhone = { val: "", score: 0 };
  var bestTimestamp = { val: "", score: 0 };

  for (var key in answersDict) {
    var val = answersDict[key];
    var valStr = Array.isArray(val) ? val.join(", ").trim() : String(val || "").trim();
    if (!valStr) continue;

    var lower = key.toLowerCase().trim();

    // Email scoring
    var emailScore = 0;
    if (lower === "email address" || lower === "email" || lower === "email id") emailScore = 100;
    else if (lower.indexOf("participant") !== -1 && lower.indexOf("email") !== -1) emailScore = 95;
    else if (lower.indexOf("email") !== -1) emailScore = 90;
    else if (lower.indexOf("mail") !== -1) emailScore = 70;
    if (emailScore > bestEmail.score) bestEmail = { val: valStr, score: emailScore };

    // Name scoring: prioritize full name over college/team
    var isExcluded = EXCLUDE_NAME_WORDS.some(function(w) { return lower.indexOf(w) !== -1; });
    var nameScore = 0;
    if (!isExcluded) {
      if (lower === "full name" || lower === "fullname" || lower === "full_name") nameScore = 100;
      else if (lower === "name of participant" || lower === "participant name" || lower === "student name" || lower === "candidate name" || lower === "applicant name" || lower === "registered name") nameScore = 95;
      else if (lower === "your name" || lower === "name") nameScore = 90;
      else if (lower.indexOf("full name") !== -1) nameScore = 85;
      else if (lower.indexOf("name") !== -1) nameScore = 70;
    } else {
      if (lower.indexOf("name") !== -1) nameScore = 10;
    }
    if (nameScore > bestName.score) bestName = { val: valStr, score: nameScore };

    // Phone scoring
    var phoneScore = 0;
    if (lower === "phone number" || lower === "mobile number" || lower === "whatsapp number") phoneScore = 100;
    else if (lower.indexOf("whatsapp") !== -1 || lower.indexOf("mobile") !== -1 || lower.indexOf("contact number") !== -1) phoneScore = 90;
    else if (lower.indexOf("phone") !== -1) phoneScore = 80;
    if (phoneScore > bestPhone.score) bestPhone = { val: valStr, score: phoneScore };

    // Timestamp scoring
    var timeScore = 0;
    if (lower === "timestamp") timeScore = 100;
    else if (lower.indexOf("timestamp") !== -1) timeScore = 90;
    else if (lower.indexOf("submitted") !== -1) timeScore = 80;
    if (timeScore > bestTimestamp.score) bestTimestamp = { val: valStr, score: timeScore };
  }

  return {
    email: bestEmail.val,
    fullName: bestName.val,
    phone: bestPhone.val,
    timestamp: bestTimestamp.val
  };
}

/**
 * Universal Form Submit Trigger Handler
 * Handles both Google Sheets trigger (e.namedValues/e.range) and Google Forms trigger (e.response).
 */
function onFormSubmit(e) {
  var config = getConfig();

  if (!config.WEBHOOK_SECRET) {
    Logger.log("⚠️ Error: WEBHOOK_SECRET is not configured in Script Properties.");
    return;
  }

  var responseId = "";
  var formSubmittedAt = "";
  var email = "";
  var fullName = "";
  var phone = "";
  var answers = {};

  if (e && e.response) {
    // ==========================================
    // CASE A: Form Trigger (From form -> On form submit)
    // ==========================================
    var response = e.response;
    responseId = response.getId();
    formSubmittedAt = response.getTimestamp().toISOString();
    email = response.getRespondentEmail() || "";
    var itemResponses = response.getItemResponses();

    for (var i = 0; i < itemResponses.length; i++) {
      var itemTitle = itemResponses[i].getItem().getTitle();
      var itemVal = itemResponses[i].getResponse();
      answers[itemTitle] = itemVal;
    }

    var extractedA = extractCandidateFields(answers);
    if (!email) email = extractedA.email;
    fullName = extractedA.fullName;
    phone = extractedA.phone;
  } else if (e && (e.namedValues || e.values)) {
    // ==========================================
    // CASE B: Spreadsheet Trigger (From spreadsheet -> On form submit)
    // ==========================================
    if (e.namedValues) {
      for (var key in e.namedValues) {
        var valArr = e.namedValues[key];
        var valStr = Array.isArray(valArr) ? valArr.join(", ") : String(valArr || "");
        answers[key] = valStr;
      }
      var extractedB = extractCandidateFields(e.namedValues);
      email = extractedB.email;
      fullName = extractedB.fullName;
      phone = extractedB.phone;
      if (!formSubmittedAt && extractedB.timestamp) {
        formSubmittedAt = extractedB.timestamp;
      }
    }

    // Deterministic & Unique responseId for Spreadsheet Trigger
    if (e.range) {
      var sheet = e.range.getSheet();
      var sheetId = sheet.getSheetId ? sheet.getSheetId() : "0";
      var row = e.range.getRow();
      responseId = "GF-SH-" + sheetId + "-R" + row;
    } else if (email && formSubmittedAt) {
      responseId = "GF-SUB-" + Utilities.base64EncodeWebSafe(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email + ":" + formSubmittedAt)
      ).substring(0, 16);
    } else {
      responseId = "GF-ROW-" + new Date().getTime();
    }
  } else {
    Logger.log("⚠️ Event object 'e' is undefined. If testing manually, run testWebhook() instead.");
    return;
  }

  if (!formSubmittedAt) {
    formSubmittedAt = new Date().toISOString();
  }

  var payload = {
    responseId: responseId,
    formSubmittedAt: formSubmittedAt,
    timestamp: formSubmittedAt,
    email: email,
    fullName: fullName,
    phone: phone,
    eventId: config.EVENT_ID,
    answers: answers
  };

  sendWithRetry(payload, 0, config);
}

/**
 * Sends registration payload with fresh timestamp and exponential backoff retry.
 */
function sendWithRetry(payload, attempt, config) {
  if (!config) config = getConfig();

  // Generate fresh request timestamp immediately before dispatch for replay protection
  var requestTimestamp = new Date().toISOString();

  var headers = {
    "Content-Type": "application/json",
    "x-integration-secret": config.WEBHOOK_SECRET,
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
    var response = UrlFetchApp.fetch(config.ENDPOINT_URL, options);
    var statusCode = response.getResponseCode();
    var bodyText = response.getContentText();

    if (statusCode >= 200 && statusCode < 300) {
      Logger.log("✅ Successfully synced response: " + payload.responseId + " (HTTP " + statusCode + ")");
      return { success: true, status: statusCode, body: bodyText };
    }

    Logger.warn("⚠️ Server returned HTTP " + statusCode + ": " + bodyText);
    if (attempt < config.MAX_RETRIES && (statusCode >= 500 || statusCode === 429)) {
      Utilities.sleep(Math.pow(2, attempt) * 1000);
      return sendWithRetry(payload, attempt + 1, config);
    }
    return { success: false, status: statusCode, body: bodyText };
  } catch (err) {
    Logger.error("❌ Network error: " + err.message);
    if (attempt < config.MAX_RETRIES) {
      Utilities.sleep(Math.pow(2, attempt) * 1000);
      return sendWithRetry(payload, attempt + 1, config);
    }
    return { success: false, error: err.message };
  }
}

/**
 * Diagnostic test function: verifies Script Properties and endpoint connectivity.
 */
function testWebhook() {
  var config = getConfig();
  Logger.log("Target Webhook URL: " + config.ENDPOINT_URL);
  Logger.log("Target Event ID: " + config.EVENT_ID);
  Logger.log("Secret Configured: " + (config.WEBHOOK_SECRET ? "YES (length " + config.WEBHOOK_SECRET.length + ")" : "NO"));

  if (!config.WEBHOOK_SECRET) {
    Logger.error("❌ Cannot run test: WEBHOOK_SECRET is empty in Script Properties!");
    return;
  }

  var testPayload = {
    responseId: "GF-TEST-APPSCRIPT-" + new Date().getTime(),
    formSubmittedAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    email: "synthetic.apps.script@algoxilla.test",
    fullName: "Synthetic Apps Script Test User",
    phone: "+919876543210",
    eventId: config.EVENT_ID,
    answers: {
      "Full Name": "Synthetic Apps Script Test User",
      "Email Address": "synthetic.apps.script@algoxilla.test",
      "College": "Algoxilla Test Institute"
    }
  };

  var result = sendWithRetry(testPayload, 0, config);
  Logger.log("Result: " + JSON.stringify(result));
}
```

---

### Step 2: Configure Script Properties
In the Apps Script editor:
1. Click **Project Settings** (gear icon on left sidebar).
2. Scroll to **Script Properties** and click **Edit script properties**.
3. Add the following three properties:
   - `WEBHOOK_URL` = `https://algoxilla-certificate-platform-1.vercel.app/api/integrations/google-forms`
   - `WEBHOOK_SECRET` = `<the exact secret configured in Vercel Production>`
   - `EVENT_ID` = `ALGOTHON26`
4. Click **Save script properties**.

---

### Step 3: Installable Trigger Configuration
If using a Google Sheet with linked responses:
1. In the Apps Script editor, click **Triggers** (alarm clock icon on left sidebar).
2. Click **Add Trigger** (bottom right):
   - Choose which function to run: `onFormSubmit`
   - Which runs at deployment: `Head`
   - Select event source: `From spreadsheet`
   - Select event type: `On form submit`
   - Failure notification settings: `Notify me daily` (or immediately)
3. Click **Save** and grant the required permissions (`SpreadsheetApp`, `UrlFetchApp`).

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
