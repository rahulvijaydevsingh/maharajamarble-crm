INSERT INTO professionals (name, phone, alternate_phone, email, firm_name, address, professional_type, status, priority, assigned_to, added_via_lead_id, created_by)
SELECT DISTINCT ON (l.phone)
  l.name, l.phone, l.alternate_phone, l.email, l.firm_name, l.site_location, l.designation, 'active', 3, l.assigned_to, l.id,
  COALESCE(l.created_by, 'system-backfill')
FROM leads l
WHERE l.designation IN ('architect','builder','contractor','interior_designer','site_supervisor','real_estate_developer')
  AND l.phone IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM professionals p WHERE p.phone = l.phone OR p.alternate_phone = l.phone
  )
ORDER BY l.phone, l.created_at ASC;

UPDATE tasks t
SET related_entity_type = 'professional', related_entity_id = p.id
FROM leads l
JOIN professionals p ON (p.phone = l.phone OR p.alternate_phone = l.phone)
WHERE t.lead_id = l.id
  AND l.designation IN ('architect','builder','contractor','interior_designer','site_supervisor','real_estate_developer')
  AND t.related_entity_type IS NULL;