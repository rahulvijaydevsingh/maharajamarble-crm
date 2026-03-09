import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface WhatsAppMessage {
  id: string;
  session_id: string | null;
  sent_by: string | null;
  lead_id: string | null;
  customer_id: string | null;
  recipient_phone: string;
  recipient_name: string | null;
  message_type: string;
  message_body: string | null;
  media_url: string | null;
  template_name: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export function useWhatsAppMessages(leadId?: string, customerId?: string) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchMessages = useCallback(async () => {
    let query = supabase
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (leadId) query = query.eq("lead_id", leadId);
    if (customerId) query = query.eq("customer_id", customerId);

    const { data, error } = await query;
    if (error) console.error("Error fetching WA messages:", error);
    setMessages((data || []) as unknown as WhatsAppMessage[]);
    setLoading(false);
  }, [leadId, customerId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const sendMessage = async (params: {
    recipientPhone: string;
    recipientName: string;
    messageBody: string;
    messageType?: string;
    mediaUrl?: string;
    templateName?: string;
    leadId?: string;
    customerId?: string;
  }) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: {
          recipientPhone: params.recipientPhone,
          recipientName: params.recipientName,
          messageBody: params.messageBody,
          messageType: params.messageType || "text",
          mediaUrl: params.mediaUrl,
          templateName: params.templateName,
          leadId: params.leadId,
          customerId: params.customerId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Message Sent!", description: `WhatsApp sent to ${params.recipientName}` });
      await fetchMessages();
      return { success: true };
    } catch (err: any) {
      toast({ title: "Send Failed", description: err.message, variant: "destructive" });
      return { success: false, error: err.message };
    }
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
}
