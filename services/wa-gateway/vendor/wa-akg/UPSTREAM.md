# Vendored WA-AKG Modules (ADR-0004)

- **Upstream Repository:** `https://github.com/mrifqidaffaaditya/wa-akg`
- **Upstream Commit:** `04d6c0f5e484df469840697e3573654691792958`
- **License:** MIT
- **Adaptations in Maharaja Marble CRM:**
  1. Replaced all Prisma MySQL calls (`prisma.*`) with clean TypeScript port interfaces (`src/ports/index.ts`).
  2. Removed `wa-sticker-formatter` and native binary dependencies; image thumbnails use pure-JS `jimp`.
  3. Removed telemetry beacon (`src/server/index.ts`) and GitHub update checks (`src/lib/github.ts`).
  4. Kept `interactive.ts` and `autoreply.ts` behind feature flags (`interactive_enabled = false`, `AutoReplyRuleSource` empty in worker because the CRM `whatsapp-inbound` router owns auto-reply rules).
