import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  body?: string | null;
  phone_e164?: string | null;
  phone10?: string | null;
  direction?: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
}

export interface WhatsAppSendInput {
  recipientPhone: string;
  recipientName: string;
  messageBody: string;
  messageType?: string;
  mediaUrl?: string;
  templateName?: string;
  leadId?: string;
  customerId?: string;
  professionalId?: string;
  slot?: "main" | "bulk" | "personal";
  requestId?: string;
  attachment?: Record<string, unknown>;
  location?: Record<string, unknown>;
}
export interface WhatsAppPreviewResult {
  success: boolean;
  requestId: string;
  data?: any;
  error?: string;
}

function unwrapFunctionData(value: any): any {
  return value?.data ?? value;
}

export function useWhatsAppMessages(leadId?: string, customerId?: string) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMessages = useCallback(async () => {
    try {
      let query = (supabase.from("whatsapp_messages" as any) as any)
        .select("id,session_id,sent_by,lead_id,customer_id,recipient_phone,recipient_name,message_type,body,phone_e164,phone10,direction,status,error_message,sent_at,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (leadId) query = query.eq("lead_id", leadId);
      if (customerId) query = query.eq("customer_id", customerId);
      const { data, error } = await query;
      if (error) throw error;
      setMessages((data ?? []).map((row: any) => ({
        ...row, message_body: row.body ?? null, media_url: null, template_name: null,
      })) as WhatsAppMessage[]);
    } catch (error) {
      console.error("Error fetching WhatsApp messages:", error);
    } finally {
      setLoading(false);
    }
  }, [leadId, customerId]);

  useEffect(() => { void fetchMessages(); }, [fetchMessages]);

  const buildPayload = (input: WhatsAppSendInput, mode: "preview" | "commit", requestId: string, previewToken?: string) => {
    const entity = input.leadId
      ? { entity_type: "lead", entity_id: input.leadId }
      : input.customerId
        ? { entity_type: "customer", entity_id: input.customerId }
        : input.professionalId
          ? { entity_type: "professional", entity_id: input.professionalId }
          : {};
    return {
      request_id: requestId,
      mode,
      kind: "single",
      slot: input.slot ?? "main",
      ...(previewToken ? { preview_token: previewToken } : {}),
      recipients: [{ ...entity, phone: input.recipientPhone, name: input.recipientName }],
      message: {
        template_text: input.messageBody,
        message_type: input.messageType ?? "text",
        ...(input.attachment ? { attachment: input.attachment } : {}),
        ...(input.location ? { location: input.location } : {}),
      },
    };
  };

  const previewSend = async (input: WhatsAppSendInput): Promise<WhatsAppPreviewResult> => {
    const requestId = input.requestId ?? crypto.randomUUID();
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-enqueue", {
        body: buildPayload(input, "preview", requestId),
      });
      if (error) throw error;
      const payload = unwrapFunctionData(data);
      if (payload?.ok === false) throw new Error(payload?.error?.message ?? "Preview failed");
      return { success: true, requestId, data: payload };
    } catch (error: any) {
      return { success: false, requestId, error: error?.message ?? "Preview failed" };
    }
  };

  const commitSend = async (input: WhatsAppSendInput, requestId: string, previewToken: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-enqueue", {
        body: buildPayload(input, "commit", requestId, previewToken),
      });
      if (error) throw error;
      const payload = unwrapFunctionData(data);
      if (payload?.ok === false) throw new Error(payload?.error?.message ?? "Send could not be queued");
      await fetchMessages();
      toast({ title: "WhatsApp queued", description: "The message has been accepted by the gateway queue." });
      return { success: true, data: payload };
    } catch (error: any) {
      toast({ title: "Send failed", description: error?.message ?? "Could not queue WhatsApp message.", variant: "destructive" });
      return { success: false, error: error?.message ?? "Send failed" };
    }
  };

  const sendMessage = async (input: WhatsAppSendInput) => {
    const preview = await previewSend(input);
    if (!preview.success) {
      toast({ title: "Preview failed", description: preview.error, variant: "destructive" });
      return { success: false, error: preview.error };
    }
    const previewToken = preview.data?.preview_token ?? preview.data?.previewToken;
    if (!previewToken) {
      const error = "The server did not return a preview token; no message was queued.";
      toast({ title: "Send blocked", description: error, variant: "destructive" });
      return { success: false, error };
    }
    return commitSend(input, preview.requestId, previewToken);
  };

  return { messages, loading, sendMessage, previewSend, commitSend, refetch: fetchMessages };
}
