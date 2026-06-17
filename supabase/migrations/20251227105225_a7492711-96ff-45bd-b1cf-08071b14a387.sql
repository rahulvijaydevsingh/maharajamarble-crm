-- Create professionals table
CREATE TABLE public.professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  alternate_phone TEXT,
  email TEXT,
  firm_name TEXT,
  address TEXT,
  city TEXT,
  professional_type TEXT NOT NULL DEFAULT 'contractor',
  service_category TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 3,
  rating INTEGER,
  total_projects INTEGER DEFAULT 0,
  notes TEXT,
  referred_by JSONB,
  assigned_to TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'System',
  last_follow_up TIMESTAMP WITH TIME ZONE,
  next_follow_up TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for professionals
CREATE POLICY "Allow all access to professionals" 
ON public.professionals 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  alternate_phone TEXT,
  email TEXT,
  company_name TEXT,
  address TEXT,
  city TEXT,
  customer_type TEXT NOT NULL DEFAULT 'individual',
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 3,
  total_orders INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  notes TEXT,
  source TEXT DEFAULT 'direct',
  lead_id UUID REFERENCES public.leads(id),
  assigned_to TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'System',
  last_purchase TIMESTAMP WITH TIME ZONE,
  last_follow_up TIMESTAMP WITH TIME ZONE,
  next_follow_up TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for customers
CREATE POLICY "Allow all access to customers" 
ON public.customers 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create updated_at triggers for both tables
CREATE TRIGGER update_professionals_updated_at
BEFORE UPDATE ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.professionals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;