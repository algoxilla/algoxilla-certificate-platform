// Algoxilla Certificate Platform - Server-Side Test Email Allowlist Verification Suite
// Verifies:
// 1. Explicit server-side allowlist replaces broad isTestDomain heuristic
// 2. Supplying an arbitrary recipient address (even with "test" or @example.com) CANNOT enable email dispatch
// 3. Only explicitly allowlisted designated test inboxes are permitted
// 4. Non-allowlisted recipients are unconditionally suppressed without making network requests
// 5. Zero network requests occur for suppressed recipients (strict fetch isolation)

import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";

function loadLocalEnv() {
  const candidateFiles = [".env.local", ".env"];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;

    if (typeof process.loadEnvFile === "function") {
      try {
        process.loadEnvFile(fullPath);
        return;
      } catch {}
    }

    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (match) {
          const key = match[1];
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
      return;
    } catch {}
  }
}
loadLocalEnv();

// Strictly enforce test context
process.env.APP_LIVE = "false";
process.env.NEXT_PUBLIC_APP_LIVE = "false";

import { 
  brevoService, 
  DEFAULT_DESIGNATED_TEST_INBOXES 
} from "../src/lib/email/brevo.ts";

console.log("================================================================================");
console.log("       TEST EMAIL ALLOWLIST & ARBITRARY RECIPIENT PREVENTION SUITE              ");
console.log("================================================================================\n");

async function runAllowlistTests() {
  // ---------------------------------------------------------------------------
  // Check 1: Authoritative Allowlist Parsing & hello@algoxilla.com Verification
  // ---------------------------------------------------------------------------
  console.log("--- Check 1: Authoritative Allowlist Parsing & hello@algoxilla.com Verification ---");
  const allowlist = brevoService.getAllowlist();
  assert.ok(allowlist.size > 0, "Allowlist must not be empty");
  assert.strictEqual(
    allowlist.has("hello@algoxilla.com"),
    true,
    "Zoho business email hello@algoxilla.com must be present in allowlist"
  );
  assert.strictEqual(
    brevoService.isRecipientAllowlisted("hello@algoxilla.com"),
    true,
    "hello@algoxilla.com must be evaluated as allowlisted"
  );
  assert.strictEqual(
    allowlist.size,
    1,
    "Allowlist must contain ONLY the single designated test inbox hello@algoxilla.com"
  );
  console.log(`✓ Check 1 Passed: Allowlist contains exactly 1 authorized test inbox: hello@algoxilla.com\n`);

  // ---------------------------------------------------------------------------
  // Check 2: hello@algoxilla.com Is Permitted to Proceed Past Safety Guard
  // ---------------------------------------------------------------------------
  console.log("--- Check 2: Designated Inbox hello@algoxilla.com Permitted ---");
  const origFetchCheck2 = globalThis.fetch;
  let check2Payload = null;
  globalThis.fetch = async (url, options) => {
    if (options?.body) {
      try { check2Payload = JSON.parse(options.body); } catch {}
    }
    return new Response(JSON.stringify({ messageId: "<simulated-test-id@smtp>" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await brevoService.sendClaimLink({
      toEmail: "hello@algoxilla.com",
      recipientName: "Algoxilla Business Admin",
      claimUrl: "https://verify.algoxilla.com/api/auth/consume-claim-link?token=allowlist-test-token",
    });
    assert.strictEqual(result.success, true);
    assert.notStrictEqual(
      result.provider,
      "SAFETY_SIMULATED",
      "hello@algoxilla.com must pass safety guard and proceed to dispatch"
    );
    assert.ok(
      result.provider === "BREVO" || result.provider === "MOCK_TEST",
      "Dispatch provider must be BREVO or MOCK_TEST"
    );
    console.log(`  ✓ Allowlisted inbox permitted: hello@algoxilla.com -> provider: ${result.provider}`);
    console.log("✓ Check 2 Passed: hello@algoxilla.com successfully permitted for controlled staging\n");
  } finally {
    globalThis.fetch = origFetchCheck2;
  }

  // ---------------------------------------------------------------------------
  // Check 3: Arbitrary Recipients Containing "test" Are STRICTLY SUPPRESSED
  // (Proves broad isTestDomain heuristic has been eliminated)
  // ---------------------------------------------------------------------------
  console.log("--- Check 3: Arbitrary Recipients Containing 'test' Are Suppressed ---");
  const arbitraryTestEmails = [
    "arbitrary.test@gmail.com",
    "john.doe.testing@outlook.com",
    "test_student@university.ac.in",
    "attacker.test@evil-domain.org",
    "testing.random.person@yahoo.com",
    "contestant.test.123@corporate.com",
    "user@testing-laboratory.net",
  ];

  for (const email of arbitraryTestEmails) {
    assert.strictEqual(
      brevoService.isRecipientAllowlisted(email),
      false,
      `Arbitrary address ${email} must NOT be in allowlist`
    );

    const result = await brevoService.sendClaimLink({
      toEmail: email,
      recipientName: "Arbitrary Recipient",
      claimUrl: "https://verify.algoxilla.com/api/auth/consume-claim-link?token=test-token",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(
      result.provider,
      "SAFETY_SIMULATED",
      `Arbitrary address ${email} containing 'test' MUST be suppressed with SAFETY_SIMULATED`
    );
    assert.ok(
      result.messageId?.startsWith("simulated-guard-"),
      "Suppressed dispatch must have simulated-guard- prefix"
    );
    console.log(`  ✓ Address containing 'test' strictly suppressed: ${email} -> provider: ${result.provider}`);
  }
  console.log("✓ Check 3 Passed: Arbitrary recipients containing 'test' are strictly suppressed\n");

  // ---------------------------------------------------------------------------
  // Check 4: Arbitrary Test Domain (@example.com / @test.com) Addresses Are Suppressed
  // ---------------------------------------------------------------------------
  console.log("--- Check 4: Arbitrary Addresses on Test Domains Are Suppressed ---");
  const arbitraryDomainEmails = [
    "random.user.999@example.com",
    "attacker@example.com",
    "unregistered.attendee@test.com",
    "fake.student@example.com",
  ];

  for (const email of arbitraryDomainEmails) {
    assert.strictEqual(
      brevoService.isRecipientAllowlisted(email),
      false,
      `Arbitrary domain address ${email} must NOT be allowlisted`
    );

    const result = await brevoService.sendClaimLink({
      toEmail: email,
      recipientName: "Arbitrary Domain Recipient",
      claimUrl: "https://verify.algoxilla.com/api/auth/consume-claim-link?token=test-token",
    });

    assert.strictEqual(
      result.provider,
      "SAFETY_SIMULATED",
      `Arbitrary domain address ${email} MUST be suppressed with SAFETY_SIMULATED`
    );
    console.log(`  ✓ Arbitrary test domain suppressed: ${email} -> provider: ${result.provider}`);
  }
  console.log("✓ Check 4 Passed: Arbitrary addresses on test domains strictly suppressed\n");

  // ---------------------------------------------------------------------------
  // Check 5: Real Participant Addresses Are Suppressed
  // ---------------------------------------------------------------------------
  console.log("--- Check 5: Real Participant Inboxes Are Suppressed ---");
  const realEmails = [
    "real.attendee@gmail.com",
    "participant@college.edu",
    "sriram.attendee@outlook.com",
  ];

  for (const email of realEmails) {
    assert.strictEqual(brevoService.isRecipientAllowlisted(email), false);
    const result = await brevoService.sendClaimLink({
      toEmail: email,
      recipientName: "Real Participant",
      claimUrl: "https://verify.algoxilla.com/api/auth/consume-claim-link?token=test-token",
    });

    assert.strictEqual(result.provider, "SAFETY_SIMULATED");
    console.log(`  ✓ Real email suppressed: ${email} -> provider: ${result.provider}`);
  }
  console.log("✓ Check 5 Passed: Real participant emails unconditionally suppressed\n");

  // ---------------------------------------------------------------------------
  // Check 6: Network Isolation Proof (Zero Network Requests for Suppressed Emails)
  // ---------------------------------------------------------------------------
  console.log("--- Check 6: Network Isolation Proof (Zero Outbound HTTP Calls) ---");
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  let fetchedUrls = [];

  globalThis.fetch = async (url, options) => {
    fetchCallCount++;
    fetchedUrls.push(typeof url === "string" ? url : url.toString());
    return originalFetch(url, options);
  };

  try {
    // Attempt dispatches to a variety of non-allowlisted emails
    const nonAllowlistedBatch = [
      "hacker.test@gmail.com",
      "student.test@school.edu",
      "random@example.com",
      "real.attendee@gmail.com",
      "another.test@test.com",
    ];

    for (const email of nonAllowlistedBatch) {
      await brevoService.sendClaimLink({
        toEmail: email,
        recipientName: "Suppressed Batch",
        claimUrl: "https://verify.algoxilla.com/api/auth/consume-claim-link?token=batch-test",
      });
    }

    assert.strictEqual(
      fetchCallCount,
      0,
      `fetch() MUST NOT be called for non-allowlisted recipients. Actual calls: ${fetchCallCount}`
    );
    console.log(`  ✓ Outbound fetch calls intercepted: exactly ${fetchCallCount} (zero network traffic)`);
    console.log("✓ Check 6 Passed: Complete network isolation confirmed — suppressed emails produce ZERO HTTP requests\n");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // ---------------------------------------------------------------------------
  // Check 7: Programmatic Allowlist Registration & Revocation
  // ---------------------------------------------------------------------------
  console.log("--- Check 7: Dynamic Allowlist Registration Lifecycle ---");
  const dynamicInbox = "dynamic.staging.tester@algoxilla.com";

  // Initially not allowlisted
  assert.strictEqual(brevoService.isRecipientAllowlisted(dynamicInbox), false);
  let res = await brevoService.sendClaimLink({
    toEmail: dynamicInbox,
    recipientName: "Dynamic Tester",
    claimUrl: "https://verify.algoxilla.com/token",
  });
  assert.strictEqual(res.provider, "SAFETY_SIMULATED");

  // Register inbox
  brevoService.addAllowlistedInbox(dynamicInbox);
  assert.strictEqual(brevoService.isRecipientAllowlisted(dynamicInbox), true);
  
  const origFetchCheck7 = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ messageId: "<dynamic-test-id@smtp>" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  try {
    res = await brevoService.sendClaimLink({
      toEmail: dynamicInbox,
      recipientName: "Dynamic Tester",
      claimUrl: "https://verify.algoxilla.com/token",
    });
    assert.strictEqual(res.success, true);
    assert.notStrictEqual(res.provider, "SAFETY_SIMULATED", "Newly allowlisted inbox must now be permitted");
    assert.ok(res.provider === "BREVO" || res.provider === "MOCK_TEST");
    console.log(`  ✓ Dynamically added inbox permitted: ${dynamicInbox} -> provider: ${res.provider}`);
  } finally {
    globalThis.fetch = origFetchCheck7;
  }

  // Revoke inbox
  brevoService.removeAllowlistedInbox(dynamicInbox);
  assert.strictEqual(brevoService.isRecipientAllowlisted(dynamicInbox), false);
  res = await brevoService.sendClaimLink({
    toEmail: dynamicInbox,
    recipientName: "Dynamic Tester",
    claimUrl: "https://verify.algoxilla.com/token",
  });
  assert.strictEqual(res.provider, "SAFETY_SIMULATED", "Revoked inbox must be suppressed again");
  console.log(`  ✓ Dynamically revoked inbox suppressed: ${dynamicInbox} -> provider: ${res.provider}`);

  console.log("✓ Check 7 Passed: Programmatic allowlist registration and revocation verified\n");

  console.log("================================================================================");
  console.log("   ALL 7 EMAIL ALLOWLIST SAFETY CHECKS PASSED CLEANLY WITH ZERO REGRESSIONS    ");
  console.log("================================================================================\n");
}

runAllowlistTests().catch((err) => {
  console.error("FATAL: Allowlist test failure:", err);
  process.exit(1);
});
