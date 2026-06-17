import React, { useState } from "react";
import { useConversations, useCreateConversation, Conversation } from "@/hooks/useChat";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, Circle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ConversationsListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationsList({ selectedId, onSelect }: ConversationsListProps) {
  const { user } = useAuth();
  const { data: conversations, isLoading } = useConversations();
  const { staffMembers, loading: staffLoading } = useActiveStaff();
  const createConversation = useCreateConversation();
  const [search, setSearch] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);

  const filteredConversations = conversations?.filter(conv => 
    conv.other_participant?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    conv.other_participant?.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleStartChat = async (staffId: string) => {
    try {
      const conversation = await createConversation.mutateAsync(staffId);
      onSelect(conversation.id);
      setNewChatOpen(false);
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const availableStaff = staffMembers.filter(
    staff => staff.id !== user?.id
  );

  return (
    <div className="w-80 border-r flex flex-col bg-card">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Direct Messages</h2>
          <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start New Conversation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {staffLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : availableStaff.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No other staff members available
                  </p>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {availableStaff.map(staff => (
                        <Button
                          key={staff.id}
                          variant="ghost"
                          className="w-full justify-start gap-3 h-auto py-3"
                          onClick={() => handleStartChat(staff.id)}
                          disabled={createConversation.isPending}
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>{getInitials(staff.name)}</AvatarFallback>
                          </Avatar>
                          <div className="text-left">
                            <p className="font-medium">{staff.name}</p>
                            <p className="text-xs text-muted-foreground">{staff.role || "Staff"}</p>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !filteredConversations || filteredConversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click + to start a new chat
            </p>
          </div>
        ) : (
          <div className="p-2">
            {filteredConversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selectedId === conv.id}
                onClick={() => onSelect(conv.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  const { other_participant, last_message, unread_count } = conversation;

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
        isSelected ? "bg-accent" : "hover:bg-muted"
      )}
    >
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={other_participant?.avatar_url || undefined} />
          <AvatarFallback>{getInitials(other_participant?.full_name)}</AvatarFallback>
        </Avatar>
        <Circle className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 fill-green-500 text-green-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium truncate">
            {other_participant?.full_name || other_participant?.email || "Unknown"}
          </p>
          {last_message && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(last_message.created_at), { addSuffix: false })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-sm text-muted-foreground truncate flex-1">
            {last_message?.is_deleted ? (
              <span className="italic">Message deleted</span>
            ) : last_message?.content ? (
              last_message.content.substring(0, 40) + (last_message.content.length > 40 ? "..." : "")
            ) : (
              <span className="italic">No messages yet</span>
            )}
          </p>
          {unread_count && unread_count > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 ml-2">
              {unread_count}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}
