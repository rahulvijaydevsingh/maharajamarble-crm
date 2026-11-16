import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { constantTimeEqual } from "./_shared/whatsappAuth.ts";
import {
  buildSiteMapLinkFromPlusCode,
  renderTemplateForRecipient,
  signPreviewToken,
  verifyPreviewToken,
} from "./_shared/whatsappPlaceholders.ts";

Deno.test("whatsappPlaceholders: resolves placeholders in single pass without double-interpolation injection", () => {
  const res = renderTemplateForRecipient(
    "Namaste {{name}}, firm: {{firm_name|Independent}}, site: {{site_location|Mohali}}, map: {{site_map_link}}",
    {
      name: "Rajesh {{firm_name}}",
      firm_name: "Sharma Architects",
      site_location: "",
      site_plus_code: "7JWRPRP9+2V",
    },
    false,
  );

  assertEquals(res.ok, true);
  // {{firm_name}} inside name must NOT be expanded a second time
  assert(res.renderedText.includes("Namaste Rajesh {{firm_name}}"));
  assert(res.renderedText.includes("firm: Sharma Architects"));
  assert(res.renderedText.includes("site: Mohali"));
  assertEquals(
    buildSiteMapLinkFromPlusCode("7JWRPRP9+2V"),
    "https://www.google.com/maps/search/?api=1&query=7JWRPRP9%2B2V",
  );
});

Deno.test("whatsappPlaceholders: blocks unresolved placeholders and invalid Plus Codes when no fallback exists", () => {
  const res = renderTemplateForRecipient(
    "Hello {{name}}, visit {{site_location}} at {{site_map_link}}",
    {
      name: "Vikram",
      site_location: null,
      site_plus_code: "INVALID",
    },
    true,
  );

  assertEquals(res.ok, false);
  assert(res.blockedReasons.includes("PLACEHOLDER_UNRESOLVED"));
  assert(res.blockedReasons.includes("SITE_PLUS_CODE_INVALID"));
});

Deno.test("whatsappPlaceholders: signs and verifies HMAC preview tokens and rejects expired or tampered tokens", async () => {
  const secret = "test-preview-secret-key";
  const now = 1_700_000_000_000;
  const token = await signPreviewToken(secret, {
    userId: "u-1",
    requestId: "req-1",
    slot: "main",
    previewHash: "hash-abc",
    expMs: now + 60_000,
  });

  const okCheck = await verifyPreviewToken(
    secret,
    token,
    { userId: "u-1", requestId: "req-1", slot: "main", previewHash: "hash-abc" },
    now + 10_000,
  );
  assertEquals(okCheck.valid, true);

  const expiredCheck = await verifyPreviewToken(
    secret,
    token,
    { userId: "u-1", requestId: "req-1", slot: "main", previewHash: "hash-abc" },
    now + 90_000,
  );
  assertEquals(expiredCheck.valid, false);
  assertEquals(expiredCheck.reason, "PREVIEW_EXPIRED");

  const tamperedCheck = await verifyPreviewToken(
    secret,
    token,
    { userId: "u-1", requestId: "req-1", slot: "bulk", previewHash: "hash-abc" },
    now + 10_000,
  );
  assertEquals(tamperedCheck.valid, false);
  assertEquals(tamperedCheck.reason, "PREVIEW_REQUIRED");
});

Deno.test("whatsappAuth: constantTimeEqual compares secrets safely", () => {
  assertEquals(constantTimeEqual("secret-123", "secret-123"), true);
  assertEquals(constantTimeEqual("secret-123", "secret-124"), false);
  assertEquals(constantTimeEqual("", ""), false);
});