import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Quotation, QuotationInsert, QuotationItem } from '@/types/quotation';
import { useToast } from '@/hooks/use-toast';
import { logToStaffActivity } from '@/lib/staffActivityLogger';

export function useQuotations() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion since the types haven't regenerated yet
      setQuotations((data as unknown as Quotation[]) || []);
    } catch (error: any) {
      console.error('Error fetching quotations:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch quotations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addQuotation = async (quotation: QuotationInsert, items: Omit<QuotationItem, 'id'>[]) => {
    try {
      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
      const gstAmount = subtotal * ((quotation.gst_percentage || 18) / 100);
      const total = subtotal + gstAmount;

      const { data: newQuotation, error: quotationError } = await supabase
        .from('quotations')
        .insert({
          client_type: quotation.client_type || 'lead',
          client_id: quotation.client_id,
          client_name: quotation.client_name,
          client_phone: quotation.client_phone,
          client_email: quotation.client_email,
          client_address: quotation.client_address,
          quotation_date: quotation.quotation_date || new Date().toISOString().split('T')[0],
          subtotal,
          gst_percentage: quotation.gst_percentage || 18,
          gst_amount: gstAmount,
          total,
          status: quotation.status || 'draft',
          notes: quotation.notes,
          valid_until: quotation.valid_until,
          assigned_to: quotation.assigned_to,
        } as any)
        .select()
        .single();

      if (quotationError) throw quotationError;

      // Insert items
      if (items.length > 0 && newQuotation) {
        const itemsToInsert = items.map((item, index) => ({
          quotation_id: (newQuotation as any).id,
          item_name: item.item_name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.quantity * item.rate,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(itemsToInsert as any);

        if (itemsError) throw itemsError;
      }

      await fetchQuotations();

      // Log to staff activity
      try {
        const session = await supabase.auth.getSession();
        const u = session.data.session?.user;
        if (u) {
          await logToStaffActivity("create_quotation", u.email || "", u.id, `Created quotation: ${(newQuotation as any).quotation_number} for ${quotation.client_name}`, "quotation", (newQuotation as any).id, { quotation_number: (newQuotation as any).quotation_number, client_name: quotation.client_name, total });
        }
      } catch (_) {}
      
      toast({
        title: 'Success',
        description: `Quotation ${(newQuotation as any).quotation_number} created successfully`,
      });

      return newQuotation as unknown as Quotation;
    } catch (error: any) {
      console.error('Error adding quotation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create quotation',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateQuotation = async (
    id: string, 
    updates: Partial<QuotationInsert>, 
    items?: Omit<QuotationItem, 'id'>[]
  ) => {
    try {
      let subtotal = updates.subtotal;
      let gstAmount = updates.gst_amount;
      let total = updates.total;

      // Recalculate if items provided
      if (items) {
        subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
        gstAmount = subtotal * ((updates.gst_percentage || 18) / 100);
        total = subtotal + gstAmount;
      }

      const { error: quotationError } = await supabase
        .from('quotations')
        .update({
          ...updates,
          subtotal,
          gst_amount: gstAmount,
          total,
        } as any)
        .eq('id', id);

      if (quotationError) throw quotationError;

      // Update items if provided
      if (items) {
        // Delete existing items
        await supabase.from('quotation_items').delete().eq('quotation_id', id);

        // Insert new items
        if (items.length > 0) {
          const itemsToInsert = items.map((item, index) => ({
            quotation_id: id,
            item_name: item.item_name,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            amount: item.quantity * item.rate,
            sort_order: index,
          }));

          const { error: itemsError } = await supabase
            .from('quotation_items')
            .insert(itemsToInsert as any);

          if (itemsError) throw itemsError;
        }
      }

      // Log quotation status change to staff_activity_log
      if (updates.status) {
        try {
          const prevQuotation = quotations.find(q => q.id === id);
          if (prevQuotation && prevQuotation.status !== updates.status) {
            const session = await supabase.auth.getSession();
            const u = session.data.session?.user;
            if (u) {
              await logToStaffActivity(
                'quotation_status_changed',
                u.email || '',
                u.id,
                `Quotation ${prevQuotation.quotation_number} status: ${prevQuotation.status} → ${updates.status}`,
                'quotation',
                id,
                { quotation_id: id, old_status: prevQuotation.status, new_status: updates.status, client_name: prevQuotation.client_name, amount: prevQuotation.total }
              );
            }
          }
        } catch (_) {}
      }

      await fetchQuotations();
      
      toast({
        title: 'Success',
        description: 'Quotation updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating quotation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update quotation',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteQuotation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('quotations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchQuotations();
      
      toast({
        title: 'Success',
        description: 'Quotation deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting quotation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete quotation',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const getQuotationWithItems = async (id: string): Promise<Quotation | null> => {
    try {
      const { data: quotation, error: quotationError } = await supabase
        .from('quotations')
        .select('*')
        .eq('id', id)
        .single();

      if (quotationError) throw quotationError;

      const { data: items, error: itemsError } = await supabase
        .from('quotation_items')
        .select('*')
        .eq('quotation_id', id)
        .order('sort_order', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        ...(quotation as unknown as Quotation),
        items: (items as unknown as QuotationItem[]) || [],
      };
    } catch (error: any) {
      console.error('Error fetching quotation:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch quotation details',
        variant: 'destructive',
      });
      return null;
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  return {
    quotations,
    loading,
    addQuotation,
    updateQuotation,
    deleteQuotation,
    getQuotationWithItems,
    refetch: fetchQuotations,
  };
}
