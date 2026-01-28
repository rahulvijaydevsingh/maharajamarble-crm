import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

export interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_at: string | null;
  created_at: string;
  other_participant?: {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
  last_message?: Message;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'file' | 'image' | 'system';
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  read_by: string[];
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  sender?: {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
  reply_to?: Message;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  target_audience: 'all' | 'roles' | 'users';
  target_roles: string[] | null;
  target_user_ids: string[] | null;
  is_pinned: boolean;
  is_active: boolean;
  scheduled_at: string | null;
  published_at: string | null;
  created_by: string;
  created_at: string;
  is_read?: boolean;
  creator?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

// Fetch all conversations for the current user
export const useConversations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!user?.id) return;
    
    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
  
  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      
      if (error) throw error;
      
      // Fetch other participant details and last message for each conversation
      const conversationsWithDetails = await Promise.all(
        (data || []).map(async (conv) => {
          const otherParticipantId = conv.participant_1 === user.id 
            ? conv.participant_2 
            : conv.participant_1;
          
          // Get other participant profile
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, email, full_name, avatar_url")
            .eq("id", otherParticipantId)
            .maybeSingle();
          
          // Get last message
          const { data: lastMessageData } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conv.id)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Count unread messages
          const { count: unreadCount } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .eq("is_deleted", false)
            .neq("sender_id", user.id)
            .not("read_by", "cs", `{${user.id}}`);
          
          return {
            ...conv,
            other_participant: profileData || undefined,
            last_message: lastMessageData as Message | undefined,
            unread_count: unreadCount || 0,
          };
        })
      );
      
      return conversationsWithDetails as Conversation[];
    },
    enabled: !!user?.id,
  });
};

// Fetch messages for a conversation
export const useMessages = (conversationId: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!conversationId) return;
    
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);
  
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(100);
      
      if (error) throw error;
      
      // Fetch sender details for each message
      const messagesWithSenders = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: senderData } = await supabase
            .from("profiles")
            .select("id, email, full_name, avatar_url")
            .eq("id", msg.sender_id)
            .maybeSingle();
          
          return {
            ...msg,
            sender: senderData || undefined,
          };
        })
      );
      
      return messagesWithSenders as Message[];
    },
    enabled: !!conversationId,
  });
};

// Send a message
export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      conversationId, 
      content, 
      messageType = 'text',
      replyToId,
      fileUrl,
      fileName,
      fileSize 
    }: { 
      conversationId: string;
      content: string;
      messageType?: 'text' | 'file' | 'image' | 'system';
      replyToId?: string;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
          message_type: messageType,
          reply_to_id: replyToId || null,
          file_url: fileUrl || null,
          file_name: fileName || null,
          file_size: fileSize || null,
          delivered_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update conversation last_message_at
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

// Create or get conversation with a user
export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from("conversations")
        .select("*")
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${user.id})`)
        .maybeSingle();
      
      if (existing) return existing;
      
      // Create new conversation
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          participant_1: user.id,
          participant_2: otherUserId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

// Mark messages as read
export const useMarkMessagesRead = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      // Get unread messages
      const { data: unreadMessages } = await supabase
        .from("messages")
        .select("id, read_by")
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .not("read_by", "cs", `{${user.id}}`);
      
      if (!unreadMessages || unreadMessages.length === 0) return;
      
      // Update each message to add user to read_by
      for (const msg of unreadMessages) {
        const currentReadBy = Array.isArray(msg.read_by) ? msg.read_by : [];
        await supabase
          .from("messages")
          .update({ 
            read_by: [...currentReadBy, user.id],
            read_at: new Date().toISOString() 
          })
          .eq("id", msg.id);
      }
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

// Announcements hooks
export const useAnnouncements = () => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const channel = supabase
      .channel('announcements-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'announcements',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["announcements"] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
  
  return useQuery({
    queryKey: ["announcements", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .not("published_at", "is", null)
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false });
      
      if (error) throw error;
      
      // Filter by target audience
      const filteredAnnouncements = (data || []).filter(ann => {
        if (ann.target_audience === 'all') return true;
        if (ann.target_audience === 'roles' && ann.target_roles?.includes(role || '')) return true;
        if (ann.target_audience === 'users' && ann.target_user_ids?.includes(user.id)) return true;
        return false;
      });
      
      // Check which ones are read
      const { data: reads } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("user_id", user.id);
      
      const readIds = new Set((reads || []).map(r => r.announcement_id));
      
      // Get creator details
      const announcementsWithDetails = await Promise.all(
        filteredAnnouncements.map(async (ann) => {
          const { data: creatorData } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", ann.created_by)
            .maybeSingle();
          
          return {
            ...ann,
            is_read: readIds.has(ann.id),
            creator: creatorData || undefined,
          };
        })
      );
      
      return announcementsWithDetails as Announcement[];
    },
    enabled: !!user?.id,
  });
};

export const useCreateAnnouncement = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (announcement: Omit<Announcement, 'id' | 'created_at' | 'created_by'>) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from("announcements")
        .insert({
          ...announcement,
          created_by: user.id,
          published_at: announcement.scheduled_at ? null : new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Announcement created", description: "Your announcement has been published." });
    },
  });
};

export const useMarkAnnouncementRead = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (announcementId: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      
      const { error } = await supabase
        .from("announcement_reads")
        .insert({
          announcement_id: announcementId,
          user_id: user.id,
        });
      
      // Ignore duplicate error
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
};

export const useUnreadCounts = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["unread-counts", user?.id],
    queryFn: async () => {
      if (!user?.id) return { messages: 0, announcements: 0 };
      
      // Count unread messages
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id")
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`);
      
      let totalUnreadMessages = 0;
      for (const conv of conversations || []) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("is_deleted", false)
          .neq("sender_id", user.id)
          .not("read_by", "cs", `{${user.id}}`);
        
        totalUnreadMessages += count || 0;
      }
      
      // Count unread announcements
      const { data: announcements } = await supabase
        .from("announcements")
        .select("id")
        .eq("is_active", true);
      
      const { data: reads } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("user_id", user.id);
      
      const readIds = new Set((reads || []).map(r => r.announcement_id));
      const unreadAnnouncements = (announcements || []).filter(a => !readIds.has(a.id)).length;
      
      return { messages: totalUnreadMessages, announcements: unreadAnnouncements };
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
};
