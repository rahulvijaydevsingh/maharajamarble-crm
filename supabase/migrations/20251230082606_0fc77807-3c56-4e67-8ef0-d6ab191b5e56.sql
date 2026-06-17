-- Create quotations table
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_number TEXT NOT NULL UNIQUE,
  client_type TEXT NOT NULL DEFAULT 'lead', -- 'lead' or 'customer'
  client_id UUID, -- FK to leads or customers
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  client_address TEXT,
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gst_percentage NUMERIC(5, 2) NOT NULL DEFAULT 18,
  gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  valid_until DATE,
  assigned_to TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotation line items table
CREATE TABLE public.quotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotation attachments table
CREATE TABLE public.quotation_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by TEXT NOT NULL DEFAULT 'System',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence for quotation numbers
CREATE SEQUENCE IF NOT EXISTS quotation_number_seq START 1;

-- Create function to generate quotation number
CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quotation_number IS NULL OR NEW.quotation_number = '' THEN
    NEW.quotation_number := 'QUO-' || LPAD(nextval('quotation_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for auto-generating quotation number
CREATE TRIGGER set_quotation_number
  BEFORE INSERT ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_quotation_number();

-- Create trigger for updating timestamps
CREATE TRIGGER update_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quotation_items_updated_at
  BEFORE UPDATE ON public.quotation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_attachments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for quotations
CREATE POLICY "Allow all access to quotations"
  ON public.quotations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create RLS policies for quotation_items
CREATE POLICY "Allow all access to quotation_items"
  ON public.quotation_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create RLS policies for quotation_attachments
CREATE POLICY "Allow all access to quotation_attachments"
  ON public.quotation_attachments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_quotations_client_id ON public.quotations(client_id);
CREATE INDEX idx_quotations_status ON public.quotations(status);
CREATE INDEX idx_quotations_date ON public.quotations(quotation_date);
CREATE INDEX idx_quotation_items_quotation_id ON public.quotation_items(quotation_id);
CREATE INDEX idx_quotation_attachments_quotation_id ON public.quotation_attachments(quotation_id);