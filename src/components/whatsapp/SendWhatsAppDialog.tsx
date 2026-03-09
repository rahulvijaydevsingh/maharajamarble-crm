import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Send, Loader2, AlertTriangle } from "lucide-react";
import { useWhatsAppMessages } from "@/hooks/useWhatsAppMessages";
import { useWhatsAppSession } from "@/hooks/useWhatsAppSession";

interface SendWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  recipientPhone: string;
  leadId?: string;
  customerId?: string;
}

const templates: Record<string, string> = {
  custom: "",
  followup: "Hi {name}, following up on your inquiry about our marble products. Would you like to discuss further?",
  quotation_ready: "Hi {name}, your quotation is ready. Please review and let us know if you have any questions.",
  meeting_reminder: "Hi {name}, this is a reminder about our scheduled meeting. Looking forward to connecting with you.",
  site_visit: "Hi {name}, confirming your site visit as scheduled. Please let us know if you need to reschedule.",
};

export function SendWhatsAppDialog({
  open,
  onOpenChange,
  recipientName,
  recipientPhone,
  leadId,
  customerId,
}: SendWhatsAppDialogProps) {
  const [template, setTemplate] = useState("custom");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { sendMessage } = useWhatsAppMessages(leadId, customerId);
  const { session } = useWhatsAppSession();

  const handleTemplateChange = (value: string) => {
    setTemplate(value);
    const tmpl = templates[value] || "";
    setMessage(tmpl.replace(/\{name\}/g, recipientName));
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError(null);

    const result = await sendMessage({
      recipientPhone,
      recipientName,
      messageBody: message,
      messageType: "text",
      templateName: template !== "custom" ? template : undefined,
      leadId,
      customerId,
    });

    setSending(false);
    if (result.success) {
      setMessage("");
      setTemplate("custom");
      onOpenChange(false);
    } else {
      setError(result.error || "Failed to send message");
    }
  };

  const isDisabled = !session || session.status !== "connected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Send WhatsApp
          </DialogTitle>
          <DialogDescription>Send a message via WhatsApp</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isDisabled && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Your WhatsApp is not connected. Connect via Settings → Staff to send messages.
              </AlertDescription>
            </Alert>
          )}

          {/* Recipient */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Recipient</Label>
              <p className="font-medium">{recipientName}</p>
              <p className="text-sm text-muted-foreground">{recipientPhone}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Sending from</Label>
              {session?.phone_number ? (
                <p className="font-medium">{session.phone_number}</p>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
          </div>

          {/* Template */}
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
                <SelectItem value="meeting_reminder">Meeting Reminder</SelectItem>
                <SelectItem value="site_visit">Site Visit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Message</Label>
              <span className="text-xs text-muted-foreground">{message.length}/1000</span>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              placeholder="Type your message..."
              rows={5}
              disabled={isDisabled}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || isDisabled || !message.trim()}
            className="bg-green-600 hover:bg-green-700"
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
