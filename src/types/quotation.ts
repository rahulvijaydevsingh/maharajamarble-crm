export interface QuotationItem {
  id: string;
  item_name: string;
  description?: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  sort_order: number;
}

export interface QuotationAttachment {
  id: string;
  quotation_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  uploaded_by: string;
  created_at: string;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  client_type: 'lead' | 'customer';
  client_id?: string;
  client_name: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  quotation_date: string;
  subtotal: number;
  gst_percentage: number;
  gst_amount: number;
  total: number;
  status: string;
  notes?: string;
  valid_until?: string;
  assigned_to: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  items?: QuotationItem[];
  attachments?: QuotationAttachment[];
}

export interface QuotationInsert {
  client_type?: 'lead' | 'customer';
  client_id?: string;
  client_name: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  quotation_date?: string;
  subtotal?: number;
  gst_percentage?: number;
  gst_amount?: number;
  total?: number;
  status?: string;
  notes?: string;
  valid_until?: string;
  assigned_to: string;
  items?: Omit<QuotationItem, 'id'>[];
}

export interface QuotationFormData {
  client_name: string;
  client_phone: string;
  client_email: string;
  client_address: string;
  quotation_date: string;
  gst_percentage: number;
  status: string;
  notes: string;
  valid_until: string;
  items: QuotationItem[];
}

export const QUOTATION_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'viewed', label: 'Viewed', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-700' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700' },
  { value: 'expired', label: 'Expired', color: 'bg-orange-100 text-orange-700' },
];

export const QUOTATION_UNITS = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'sqft', label: 'Sq. Ft.' },
  { value: 'sqm', label: 'Sq. M.' },
  { value: 'kg', label: 'Kg' },
  { value: 'tons', label: 'Tons' },
  { value: 'rft', label: 'Running Ft.' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'lot', label: 'Lot' },
];
