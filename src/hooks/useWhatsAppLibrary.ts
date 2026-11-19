import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  deleteLibraryItemWithStorage,
  uploadAndRegisterLibraryMedia,
  type WhatsAppLibraryCategory,
  type WhatsAppLibraryItemRow,
} from "@/lib/whatsappMedia";

export function useWhatsAppLibrary() {
  const auth = useAuth();
  const { toast } = useToast();
  const isAdmin = Boolean(auth.isAdmin());
  const [items, setItems] = useState<WhatsAppLibraryItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);

  const refresh = useCallback(async (includeInactive = false) => {
    if (!auth.user) {
      setItems([]);
      return [];
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("wa_library_list", {
        p_kind: null,
        p_active_only: !(includeInactive && isAdmin),
      });
      if (error) throw error;
      const rows = (data ?? []) as WhatsAppLibraryItemRow[];
      setItems(rows);
      return rows;
    } catch (error: any) {
      toast({
        title: "Library could not be loaded",
        description: error?.message ?? "Please retry.",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [auth.user, isAdmin, toast]);

  useEffect(() => {
    void refresh(isAdmin);
  }, [refresh, isAdmin]);

  const upload = useCallback(async (params: {
    file: File;
    title: string;
    description?: string;
    category: WhatsAppLibraryCategory;
  }) => {
    if (!isAdmin) throw new Error("Only administrators can upload to the WhatsApp library.");
    setMutating(true);
    try {
      const row = await uploadAndRegisterLibraryMedia(params);
      await refresh(true);
      toast({ title: "Library item added", description: row.title + " is ready to reuse." });
      return row;
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message ?? "Could not add this library item.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setMutating(false);
    }
  }, [isAdmin, refresh, toast]);

  const setActive = useCallback(async (itemId: string, active: boolean) => {
    if (!isAdmin) throw new Error("Only administrators can change library items.");
    setMutating(true);
    try {
      const { error } = await (supabase.rpc as any)("wa_library_set_active", {
        p_item_id: itemId,
        p_active: active,
      });
      if (error) throw error;
      await refresh(true);
      toast({
        title: active ? "Library item activated" : "Library item archived",
        description: "The reusable media library has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message ?? "Could not update this library item.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setMutating(false);
    }
  }, [isAdmin, refresh, toast]);

  const remove = useCallback(async (item: WhatsAppLibraryItemRow) => {
    if (!isAdmin) throw new Error("Only administrators can delete library items.");
    setMutating(true);
    try {
      await deleteLibraryItemWithStorage({
        id: item.id,
        path: item.path,
        bucket: item.bucket,
      });
      await refresh(true);
      toast({ title: "Library item deleted", description: item.title + " was removed." });
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message ?? "Could not delete this library item.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setMutating(false);
    }
  }, [isAdmin, refresh, toast]);

  return { items, loading, mutating, isAdmin, refresh, upload, setActive, remove };
}
