import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { MessageCircle, Send, Loader2, AlertTriangle } from "lucide-react";
import { useWhatsAppSettings } from "@/hooks/useWhatsAppSettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BulkRecipient {
  id: string;
  name: string;
  phone: string;
}

interface BulkWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: BulkRecipient[];
}

const templates: Record<string, string> = {
  custom: "",
  followup: "Hi {name}, following up on your inquiry about our marble products. Would you like to discuss further?",
  quotation_ready: "Hi {name}, your quotation is ready. Please review and let us know if you have any questions.",
  promotion: "Hi {name}, we have exciting new marble collections available. Visit our showroom for exclusive offers!",
};

export function BulkWhatsAppDialog({ open, onOpenChange, recipients }: BulkWhatsAppDialogProps) {
  const { settings } = useWhatsAppSettings();
  const { toast } = useToast();
  const [template, setTemplate] = useState("custom");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  const validRecipients = recipients.filter((r) => r.phone);
  const delay = settings?.delay_between_msgs_seconds || 10;
  const estimatedMinutes = Math.ceil((validRecipients.length * delay) / 60);
  const remaining = (settings?.daily_limit_bulk || 100); // simplified

  const handleTemplateChange = (value: string) => {
    setTemplate(value);
    setMessage(templates[value] || "");
  };

  const handleSend = async () => {
    if (!message.trim() || !confirmed) return;
    setSending(true);
    setProgress(0);

    try {
      const now = new Date();
      const queueItems = validRecipients.map((r, i) => ({
        recipient_phone: r.phone,
        recipient_name: r.name,
        lead_id: r.id,
        message_type: "text",
        message_body: message.replace(/\{name\}/g, r.name),
        scheduled_for: new Date(now.getTime() + i * delay * 1000).toISOString(),
        is_bulk: true,
        status: "pending",
        priority: 5,
      }));

      const { error } = await supabase
        .from("whatsapp_queue")
        .insert(queueItems as any);

      if (error) throw error;

      toast({
        title: "Bulk Messages Queued",
        description: `${validRecipients.length} messages queued for delivery`,
      });
      setProgress(100);
      setTimeout(() => {
        onOpenChange(false);
        setSending(false);
        setProgress(0);
        setMessage("");
        setConfirmed(false);
      }, 1500);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Bulk WhatsApp
          </DialogTitle>
          <DialogDescription>Send WhatsApp to multiple leads at once</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total selected:</span>{" "}
              <strong>{recipients.length}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">With phone:</span>{" "}
              <strong className="text-green-600">{validRecipients.length}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Est. time:</span>{" "}
              <strong>~{estimatedMinutes} min</strong>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={template} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom message</SelectItem>
                <SelectItem value="followup">Follow-up</SelectItem>
                <SelectItem value="quotation_ready">Quotation Ready</SelectItem>
                <SelectItem value="promotion">Promotion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Message (use {"{name}"} for personalization)</Label>
              <span className="text-xs text-muted-foreground">{message.length}/1000</span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              placeholder="Hi {name}, ..."
              rows={5}
            />
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Bulk messages carry ban risk.</strong> Only send to leads who have enquired with
              you. Do not send to cold contacts.
            </AlertDescription>
          </Alert>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="confirm-bulk"
              checked={confirmed}
              onCheckedChange={(c) => setConfirmed(c === true)}
            />
            <label htmlFor="confirm-bulk" className="text-sm">
              I confirm these contacts have interacted with our business
            </label>
          </div>

          {sending && <Progress value={progress} className="w-full" />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !confirmed || !message.trim() || validRecipients.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Queuing...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Start Sending ({validRecipients.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
