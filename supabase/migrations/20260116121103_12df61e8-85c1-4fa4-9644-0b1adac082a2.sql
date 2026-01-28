-- Create a table for custom role permissions
CREATE TABLE IF NOT EXISTS public.custom_role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role)
);

-- Enable RLS
ALTER TABLE public.custom_role_permissions ENABLE ROW LEVEL SECURITY;

-- Only admins can view role permissions
CREATE POLICY "Admins can view role permissions" 
ON public.custom_role_permissions 
FOR SELECT 
TO authenticated
USING (public.is_admin());

-- Only admins can insert role permissions
CREATE POLICY "Admins can insert role permissions" 
ON public.custom_role_permissions 
FOR INSERT 
TO authenticated
WITH CHECK (public.is_admin());

-- Only admins can update role permissions
CREATE POLICY "Admins can update role permissions" 
ON public.custom_role_permissions 
FOR UPDATE 
TO authenticated
USING (public.is_admin());

-- Only admins can delete role permissions
CREATE POLICY "Admins can delete role permissions" 
ON public.custom_role_permissions 
FOR DELETE 
TO authenticated
USING (public.is_admin());

-- Create trigger for updated_at
CREATE TRIGGER update_custom_role_permissions_updated_at
BEFORE UPDATE ON public.custom_role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default permissions for non-system roles
INSERT INTO public.custom_role_permissions (role, permissions)
VALUES 
  ('manager', ARRAY['leads.create', 'leads.edit', 'leads.bulk_actions', 'leads.export', 'leads.convert', 'customers.create', 'customers.edit', 'customers.bulk_actions', 'tasks.create', 'tasks.edit', 'tasks.bulk_actions', 'tasks.assign', 'professionals.create', 'professionals.edit', 'quotations.create', 'quotations.edit']),
  ('sales_user', ARRAY['leads.create', 'leads.edit', 'leads.export', 'customers.create', 'customers.edit', 'tasks.create', 'tasks.edit', 'professionals.create', 'professionals.edit', 'quotations.create', 'quotations.edit']),
  ('field_agent', ARRAY['leads.create', 'leads.edit', 'tasks.create', 'tasks.edit']),
  ('sales_viewer', ARRAY['leads.export'])
ON CONFLICT (role) DO NOTHING;