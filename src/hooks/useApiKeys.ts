import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
}

async function sha256(message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRawKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "mmcrm_";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function useApiKeys() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase
      .from("api_keys" as any)
      .select("id, key_prefix, name, last_used_at, created_at, is_active")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }) as any);
    if (!error && data) setKeys(data as ApiKey[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const generateKey = async (name: string): Promise<string | null> => {
    if (!user) return null;
    const rawKey = generateRawKey();
    const keyHash = await sha256(rawKey);
    const keyPrefix = rawKey.substring(0, 12);

    const { error } = await (supabase.from("api_keys" as any).insert as any)({
      user_id: user.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: name || "Default Key",
    });

    if (error) {
      toast({ title: "Failed to create API key", description: error.message, variant: "destructive" });
      return null;
    }

    await fetchKeys();
    toast({ title: "API key created", description: "Save it now — it won't be shown again." });
    return rawKey;
  };

  const revokeKey = async (keyId: string) => {
    const { error } = await (supabase
      .from("api_keys" as any)
      .update({ is_active: false } as any)
      .eq("id", keyId) as any);
    if (error) {
      toast({ title: "Failed to revoke key", description: error.message, variant: "destructive" });
      return;
    }
    await fetchKeys();
    toast({ title: "API key revoked" });
  };

  const deleteKey = async (keyId: string) => {
    const { error } = await (supabase
      .from("api_keys" as any)
      .delete()
      .eq("id", keyId) as any);
    if (error) {
      toast({ title: "Failed to delete key", description: error.message, variant: "destructive" });
      return;
    }
    await fetchKeys();
    toast({ title: "API key deleted" });
  };

  return { keys, loading, generateKey, revokeKey, deleteKey, refetch: fetchKeys };
}
