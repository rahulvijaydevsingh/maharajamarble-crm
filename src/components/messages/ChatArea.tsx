import React, { useState, useRef, useEffect } from "react";
import { useMessages, useSendMessage, useMarkMessagesRead, Message } from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, 
  Smile, 
  Paperclip, 
  MessageSquare,
  Check,
  CheckCheck,
  MoreVertical,
  Reply,
  Trash2,
  Edit2
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatAreaProps {
  conversationId: string | null;
}

export function ChatArea({ conversationId }: ChatAreaProps) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark messages as read when conversation is opened
  useEffect(() => {
    if (conversationId) {
      markRead.mutate(conversationId);
    }
  }, [conversationId]);

  const handleSend = async () => {
    if (!messageText.trim() || !conversationId) return;

    try {
      await sendMessage.mutateAsync({
        conversationId,
        content: messageText.trim(),
        replyToId: replyTo?.id,
      });
      setMessageText("");
      setReplyTo(null);
      inputRef.current?.focus();
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  // Group messages by date
  const groupedMessages = messages?.reduce((groups, message) => {
    const date = formatMessageDate(message.created_at);
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {} as Record<string, Message[]>);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Select a conversation</h3>
          <p className="text-muted-foreground mt-1">
            Choose a conversation from the left to start chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading messages...
            </div>
          ) : !messages || messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No messages yet. Send the first message!
            </div>
          ) : (
            Object.entries(groupedMessages || {}).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">{date}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-3">
                  {dateMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender_id === user?.id}
                      onReply={() => {
                        setReplyTo(message);
                        inputRef.current?.focus();
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Reply preview */}
      {replyTo && (
        <div className="px-4 py-2 bg-muted border-t flex items-center gap-2">
          <Reply className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 text-sm truncate">
            <span className="font-medium">{replyTo.sender?.full_name}</span>
            <span className="text-muted-foreground ml-2">{replyTo.content.substring(0, 50)}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
            ×
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t bg-card">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
            <Smile className="h-5 w-5" />
          </Button>
          <Input
            ref={inputRef}
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessage.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  onReply: () => void;
}

function MessageBubble({ message, isOwn, onReply }: MessageBubbleProps) {
  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getReadStatus = () => {
    if (!isOwn) return null;
    if (message.read_by && message.read_by.length > 0) {
      return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />;
    }
    if (message.delivered_at) {
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
    }
    return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <div className={cn("flex gap-3 group", isOwn && "flex-row-reverse")}>
      {!isOwn && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={message.sender?.avatar_url || undefined} />
          <AvatarFallback className="text-xs">
            {getInitials(message.sender?.full_name)}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[70%]", isOwn && "items-end")}>
        {!isOwn && (
          <p className="text-xs text-muted-foreground mb-1 ml-1">
            {message.sender?.full_name}
          </p>
        )}
        <div className="flex items-end gap-1">
          <div
            className={cn(
              "rounded-2xl px-4 py-2",
              isOwn 
                ? "bg-primary text-primary-foreground rounded-br-md" 
                : "bg-muted rounded-bl-md"
            )}
          >
            {message.is_deleted ? (
              <p className="italic text-muted-foreground">Message deleted</p>
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? "end" : "start"}>
              <DropdownMenuItem onClick={onReply}>
                <Reply className="h-4 w-4 mr-2" />
                Reply
              </DropdownMenuItem>
              {isOwn && (
                <>
                  <DropdownMenuItem>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className={cn("flex items-center gap-1 mt-0.5 text-xs text-muted-foreground", isOwn && "justify-end")}>
          <span>{format(new Date(message.created_at), "h:mm a")}</span>
          {message.is_edited && <span>• edited</span>}
          {getReadStatus()}
        </div>
      </div>
    </div>
  );
}
