-- Supports quotation ownership/access checks used by attachment storage policies.
create index if not exists idx_quotations_assigned_created on public.quotations (assigned_to, created_by);
