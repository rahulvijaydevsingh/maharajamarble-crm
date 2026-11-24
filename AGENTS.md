# Project Guidance

- Keep client-side image resizing in `src/lib/imageCompression.ts` so live attendance camera captures share one bounded, fail-safe compression path.
- Resolve a lead task's supplemental professional link only for professional-designated leads with a verified single active phone match; preserve `tasks.lead_id` so both contexts remain available.
- Lead conversion eligibility is centralized in `leadConversionEligibility` so every `LeadDetailView` entry point uses the same converted-state and deleted-lead rules.