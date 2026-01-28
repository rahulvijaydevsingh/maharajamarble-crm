import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Clock, AlertCircle, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, parseISO, isPast, isToday, formatDistanceToNow } from "date-fns";
import { useReminders } from "@/hooks/useReminders";
import { 
  useNotifications, 
  useUnreadNotificationCount, 
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDismissNotification 
} from "@/hooks/useNotifications";
import { useConversations, useUnreadCounts } from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function NotificationDropdown() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  
  // Reminders
  const { reminders, dismissReminder, snoozeReminder } = useReminders();
  const activeReminders = reminders.filter(r => !r.is_dismissed).slice(0, 10);
  
  // Notifications
  const { data: notifications = [] } = useNotifications(user?.id || "", false);
  const { data: unreadCount = 0 } = useUnreadNotificationCount(user?.id || "");
  const markAsRead = useMarkNotificationRead();
  const markAllAsRead = useMarkAllNotificationsRead();
  const dismissNotification = useDismissNotification();

  // Direct Messages
  const { data: conversations = [] } = useConversations();
  const { data: unreadCounts } = useUnreadCounts();
  const unreadMessagesCount = unreadCounts?.messages || 0;

  // Get conversations with unread messages
  const conversationsWithUnread = conversations.filter(c => c.unread_count && c.unread_count > 0).slice(0, 10);

  const totalUnread = unreadCount + unreadMessagesCount + activeReminders.filter(r => isPast(parseISO(r.reminder_datetime))).length;

  const getTimeLabel = (datetime: string) => {
    const date = parseISO(datetime);
    if (isPast(date)) return "Overdue";
    if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
    return format(date, "MMM d, h:mm a");
  };

  const handleDismissReminder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await dismissReminder(id);
  };

  const handleSnoozeReminder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const snoozeUntil = new Date();
    snoozeUntil.setHours(snoozeUntil.getHours() + 1);
    await snoozeReminder(id, snoozeUntil);
  };

  const handleReminderClick = (reminder: any) => {
    setOpen(false);
    if (reminder.entity_type === 'lead') {
      navigate(`/leads?view=${reminder.entity_id}&tab=reminders&highlightReminder=${reminder.id}`);
    } else if (reminder.entity_type === 'customer') {
      navigate(`/customers?view=${reminder.entity_id}&tab=reminders&highlightReminder=${reminder.id}`);
    }
  };

  const handleMarkNotificationRead = (notificationId: string) => {
    markAsRead.mutate(notificationId);
  };

  const handleDismissNotification = (notificationId: string) => {
    dismissNotification.mutate(notificationId);
  };

  const handleMarkAllRead = () => {
    if (user?.id) {
      markAllAsRead.mutate(user.id);
    }
  };

  const handleMessageClick = (conversationId: string) => {
    setOpen(false);
    navigate(`/messages?conversation=${conversationId}`);
  };

  const handleViewAllMessages = () => {
    setOpen(false);
    navigate('/messages');
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[400px] p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="text-xs h-7">
              Mark all as read
            </Button>
          )}
        </div>
        
        <Tabs defaultValue="messages" className="w-full">
          <TabsList className="w-full grid grid-cols-3 rounded-none border-b">
            <TabsTrigger value="messages" className="relative text-xs">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Inbox
              {unreadMessagesCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 text-[10px] px-1">
                  {unreadMessagesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reminders" className="relative text-xs">
              <Clock className="h-3.5 w-3.5 mr-1" />
              Reminders
              {activeReminders.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1">
                  {activeReminders.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notifications" className="relative text-xs">
              <Bell className="h-3.5 w-3.5 mr-1" />
              Alerts
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Inbox / Direct Messages Tab */}
          <TabsContent value="messages" className="m-0">
            <ScrollArea className="h-[300px]">
              {conversationsWithUnread.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mb-2" />
                  <p className="text-sm">No unread messages</p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    onClick={handleViewAllMessages}
                    className="mt-2"
                  >
                    View all messages
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {conversationsWithUnread.map((conversation) => (
                    <div
                      key={conversation.id}
                      onClick={() => handleMessageClick(conversation.id)}
                      className="p-3 hover:bg-muted/50 transition-colors cursor-pointer bg-primary/5"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={conversation.other_participant?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {conversation.other_participant?.full_name?.split(" ").map(n => n[0]).join("").toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm truncate">
                              {conversation.other_participant?.full_name || "Unknown"}
                            </p>
                            {conversation.unread_count && conversation.unread_count > 0 && (
                              <Badge variant="destructive" className="h-5 text-xs">
                                {conversation.unread_count}
                              </Badge>
                            )}
                          </div>
                          {conversation.last_message && (
                            <p className="text-xs text-muted-foreground truncate">
                              {conversation.last_message.content}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {conversation.last_message_at 
                              ? formatDistanceToNow(parseISO(conversation.last_message_at), { addSuffix: true })
                              : "No messages yet"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="p-2 border-t">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleViewAllMessages}
                      className="w-full text-xs"
                    >
                      View all messages
                    </Button>
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          {/* Reminders Tab */}
          <TabsContent value="reminders" className="m-0">
            <ScrollArea className="h-[300px]">
              {activeReminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <Check className="h-8 w-8 mb-2 text-green-500" />
                  <p className="text-sm">No pending reminders</p>
                </div>
              ) : (
                <div className="divide-y">
                  {activeReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      onClick={() => handleReminderClick(reminder)}
                      className={cn(
                        "p-3 hover:bg-muted/50 transition-colors cursor-pointer",
                        isPast(parseISO(reminder.reminder_datetime)) && "bg-destructive/5"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "mt-0.5 p-1.5 rounded-full",
                          isPast(parseISO(reminder.reminder_datetime)) 
                            ? "bg-destructive/10 text-destructive" 
                            : "bg-primary/10 text-primary"
                        )}>
                          {isPast(parseISO(reminder.reminder_datetime)) ? (
                            <AlertCircle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{reminder.title}</p>
                          {reminder.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {reminder.description}
                            </p>
                          )}
                          <p className={cn(
                            "text-xs mt-1",
                            isPast(parseISO(reminder.reminder_datetime)) 
                              ? "text-destructive" 
                              : "text-muted-foreground"
                          )}>
                            {getTimeLabel(reminder.reminder_datetime)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => handleSnoozeReminder(reminder.id, e)}
                            title="Snooze 1 hour"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => handleDismissReminder(reminder.id, e)}
                            title="Dismiss"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          {/* Alerts / System Notifications Tab */}
          <TabsContent value="notifications" className="m-0">
            <ScrollArea className="h-[300px]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <Bell className="h-8 w-8 mb-2" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.slice(0, 20).map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        "p-3 hover:bg-muted/50 transition-colors cursor-pointer",
                        !notification.is_read && "bg-primary/5"
                      )}
                      onClick={() => handleMarkNotificationRead(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 rounded-full bg-primary/10 text-primary">
                          <Bell className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm", !notification.is_read && "font-medium")}>
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-xs text-muted-foreground truncate">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismissNotification(notification.id);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}