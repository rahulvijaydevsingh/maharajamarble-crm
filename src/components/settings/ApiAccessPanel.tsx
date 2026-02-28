import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useToast } from "@/hooks/use-toast";
import { Key, Copy, Trash2, Plus, ExternalLink, Eye, EyeOff, AlertTriangle, Shield } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ApiAccessPanel() {
  const { keys, loading, generateKey, revokeKey, deleteKey } = useApiKeys();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [newKeyName, setNewKeyName] = useState("Default Key");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [generating, setGenerating] = useState(false);

  const baseUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api`;

  const handleGenerate = async () => {
    setGenerating(true);
    const key = await generateKey(newKeyName);
    setGenerating(false);
    if (key) {
      setGeneratedKey(key);
      setNewKeyName("Default Key");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Access
          </CardTitle>
          <CardDescription>
            Manage API keys for external integrations with AI tools like Claude, ChatGPT, and Grok.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              API keys grant full access to your CRM data. Keep them secret and never share publicly.
            </AlertDescription>
          </Alert>

          {/* Base URL */}
          <div className="space-y-2">
            <Label>API Base URL</Label>
            <div className="flex gap-2">
              <Input value={baseUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(baseUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Generate New Key */}
          <div className="space-y-2">
            <Label>Generate New API Key</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Key name (e.g. Claude Integration)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <Button onClick={() => setShowGenDialog(true)} disabled={generating}>
                <Plus className="h-4 w-4 mr-2" />
                Generate
              </Button>
            </div>
          </div>

          {/* Existing Keys */}
          <div className="space-y-3">
            <Label>Your API Keys</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys yet. Generate one above.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{key.name}</span>
                        <Badge variant={key.is_active ? "default" : "secondary"}>
                          {key.is_active ? "Active" : "Revoked"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground font-mono">
                        {key.key_prefix}••••••••
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {format(new Date(key.created_at), "PPp")}
                        {key.last_used_at && ` · Last used: ${format(new Date(key.last_used_at), "PPp")}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {key.is_active && (
                        <Button variant="outline" size="sm" onClick={() => revokeKey(key.id)}>
                          Revoke
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteKey(key.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Link to docs */}
          <Button variant="link" className="p-0" onClick={() => navigate("/api-docs")}>
            <ExternalLink className="h-4 w-4 mr-1" />
            View API Documentation
          </Button>
        </CardContent>
      </Card>

      {/* Generate Confirmation Dialog */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
            <DialogDescription>
              This will create a new API key named "{newKeyName}". The key will only be shown once.
            </DialogDescription>
          </DialogHeader>
          {generatedKey ? (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Save this key now!</strong> It will not be shown again.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Input value={generatedKey} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(generatedKey)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            {generatedKey ? (
              <Button onClick={() => { setGeneratedKey(null); setShowGenDialog(false); }}>
                I've saved it
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowGenDialog(false)}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? "Generating..." : "Generate Key"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
