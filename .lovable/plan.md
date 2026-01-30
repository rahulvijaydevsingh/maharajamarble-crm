
Goal
- When a “professional” contact is entered inside the Lead Entry form, saving should:
  1) Create the Lead (as today)
  2) Also create one or more Professional records (one per professional-designation contact person, as you specified)
- Unify “Lead Designation (Professional section)” and “Professional Type” so they always stay consistent while still letting you edit:
  - Individual designations from Leads control panel
  - Professional designations/types from Professionals control panel

Key idea (how we unify while keeping your “two editable sections” requirement)
- Treat “Designation” in Lead Entry as a combined dropdown with two sections:
  - Individual section = options from Control Panel → Leads → Designation
  - Professional section = options from Control Panel → Professionals → Professional Type
- Data consistency rule:
  - If a lead contact’s designation value comes from the Professional section, it must be a valid Professional Type value (same value stored in both lead.designation and professional.professional_type).
  - Leads control panel will no longer be the source of professional designations; professionals control panel will be.

What will change in the UI (Lead Entry form)
1) Update the “Designation” dropdown in the lead entry (SmartLeadForm → ContactDetailsSection) to:
   - Load individual options from getFieldOptions("leads","designation")
   - Load professional options from getFieldOptions("professionals","professional_type")
   - Render them as two labeled sections (Individual / Professional), matching your current visual grouping.
2) Update “isProfessionalDesignation()” logic:
   - Stop relying on the hardcoded DESIGNATIONS list in src/constants/leadConstants.ts for runtime decisions.
   - Instead, compute “professional vs individual” using the control panel professional type list (so if you add a new professional type in control panel, the lead form instantly respects it).
3) Keep Firm Name logic:
   - “Firm Name” field will show when designation is from the Professional section (same as today, but using the new dynamic source list).

What will change in the backend behavior (what gets created on save)
1) Pass full contact list to the save handler
- Today SmartLeadForm calls onSave(formData, generatedTask) and Leads.tsx builds a single leadData from “leadCategory”.
- We will change this flow so the lead save handler gets enough data to:
  - Save the lead with the correct primary contact designation (the selected designation value)
  - Also create professionals for every professional-contact entry

2) Create professionals from professional contacts
- On submit, for each contact person where designation is “professional”:
  - Create a professional record with:
    - name = contact.name
    - phone = contact.phone
    - alternate_phone = contact.alternatePhone (if any)
    - email = contact.email (if any)
    - firm_name = contact.firmName (if any)
    - professional_type = contact.designation (because designation professional section comes from professional_type list)
    - assigned_to = same assignee as the lead (use existing convention in the app)
    - site_plus_code = lead’s sitePlusCode (you asked to copy it too)
    - address = use lead’s siteLocation or address depending on what the UI captures (we’ll follow the existing field meanings consistently)

3) Duplicate behavior (same policy concept as lead entry)
Right now the lead entry duplicate checker only checks the Leads table.
We’ll implement professionals duplicate check before allowing submit:
- For every professional contact phone number:
  - Check if a Professional exists with phone or alternate_phone = that number
  - If yes: show “Duplicate Professional Found” and block the submission (same “blocking duplicate” behavior you want)
- This prevents accidental creation of duplicate professionals while keeping behavior consistent with the lead form’s current duplicate-blocking approach.

Important: your rule about 2 professional contacts
- If the user enters two contacts and both are professional designation:
  - Create 2 separate Professional records (different names and phones)
  - Copy the rest of attributes (firm/email/plus code/assigned_to) as per your instruction
- We will also validate that those two phone numbers are not identical (otherwise the user would be creating duplicates within the same submission).

Control Panel changes (to enforce the “two editable sources” design)
1) Update defaults / guidance (non-breaking)
- We will treat Leads → Designation as “Individual Designations”
- We will treat Professionals → Professional Type as “Professional Designations”
- In the UI, we can add a short helper text under Leads → Designation clarifying it only controls the Individual section of lead designation (optional but recommended)

2) Data cleanup / transition plan (so existing installs don’t break)
Because the current seeded defaults include professional entries inside Leads → Designation (architect, contractor, etc.), we need a migration strategy at the “settings data” level:
- On app startup or control panel load (safe, idempotent):
  - Detect if Leads → Designation still contains professional-like entries that also exist in Professionals → Professional Type
  - Option A (recommended): keep them but ignore them in the lead entry UI for the professional section (professional section only reads from Professionals module). This avoids data-loss and avoids risky automatic deletions.
  - Option B (optional): offer an admin cleanup action later (“Remove professional designations from Leads Designation list”) that only edits the control panel options, not leads/professionals data.

Implementation steps (code)
A) Lead form designation unification
- Update src/components/leads/smart-form/ContactDetailsSection.tsx
  - Replace static DESIGNATIONS usage with control-panel sourced options:
    - const individualDesignations = getFieldOptions("leads","designation")
    - const professionalTypes = getFieldOptions("professionals","professional_type")
  - Render <SelectContent> with two sections:
    - Individual section from individualDesignations
    - Professional section from professionalTypes
  - Update showFirmName logic to use professionalTypes list membership
- Update src/constants/leadConstants.ts
  - Deprecate DESIGNATIONS as the runtime source (keep only as fallback if needed)
  - Replace isProfessionalDesignation(designation) usage in lead entry with a dynamic helper (likely moved to a hook or utility that reads control panel settings)

B) Saving flow changes (create professionals + lead)
- Update src/components/leads/SmartLeadForm.tsx
  - Build a payload that includes:
    - contacts array (with designation, name, phones, email, firmName)
    - sitePlusCode + siteLocation
    - assignedTo
    - existing lead form fields used for the lead record
  - Update onSave signature accordingly
- Update src/pages/Leads.tsx (handleAddLead)
  - Use the new payload to:
    1) create lead using primary contact data (designation = primaryContact.designation)
    2) create follow-up task as today
    3) create professionals for each professional contact
  - Ensure activity logging is triggered for:
    - lead created
    - professional(s) created
    - task created
  (If activity logging is centralized already for tasks/leads, we’ll align to that; otherwise we’ll add explicit log calls here.)

C) Duplicate checks for professionals during lead entry
- Extend duplicate check capability:
  - Either enhance src/hooks/usePhoneDuplicateCheck.ts to check multiple entities (leads + professionals), or create a new hook (recommended) that can check:
    - leads table
    - professionals table
    - (optional later) customers table
- Integrate that into ContactDetailsSection so professional contacts check against professionals too.
- Block submit if any professional duplicate exists(recommendation from user:instead of blocking the lead creation we should just skip the entry into the database) as the number of professnals can be used again and again to create lead while still having them in database,we will need to work with professinals again and again so leads must be created again and again)rethink this before implementing .

D) Consistency validation and “future remix-proof” behavior
- Ensure no hardcoded designation/professional type lists are required for correctness.
- Use control panel settings as the single source for:
  - individual designation options
  - professional type options
- Add defensive fallbacks:
  - If control panel data is empty, fallback to current defaults so form never breaks.

Testing checklist (end-to-end)
1) Create a lead with:
   - Contact 1: designation = professional type (e.g., Architect), phone A
   - Contact 2: designation = professional type (e.g., Contractor), phone B
   - Confirm:
     - Lead is created
     - Two professionals are created (A and B)
     - Both appear in Professionals page
     - Activity log shows lead_created + professional_created (and task_created if applicable)
2) Try to create another lead with a professional contact using an existing professional phone:
   - Confirm duplicate warning appears and blocks submit
3) Add a new professional type in control panel:
   - Confirm it appears immediately in lead entry designation professional section
4) Remove/deactivate a professional type in control panel:
   - Confirm lead entry no longer offers it (and later we can add dependency safety warnings as a separate enhancement)

Notes / constraints
- No database schema change is required for this unification approach, because:
  - leads.designation and professionals.professional_type are both stored as text values
  - the “unification” is enforced by UI source-of-truth + validation, not by rigid DB constraints
- This matches your requirement that the two “sections” are edited in different places of the control panel, while still ensuring consistency.

