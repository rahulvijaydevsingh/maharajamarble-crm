import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Megaphone } from "lucide-react";
import { ConversationsList } from "@/components/messages/ConversationsList";
import { ChatArea } from "@/components/messages/ChatArea";
import { AnnouncementsList } from "@/components/messages/AnnouncementsList";
import { useUnreadCounts } from "@/hooks/useChat";
import { Badge } from "@/components/ui/badge";

export default function Messages() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("messages");
  const { data: unreadCounts } = useUnreadCounts();

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b bg-card px-4">
            <TabsList className="h-12">
              <TabsTrigger value="messages" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Messages
                {unreadCounts && unreadCounts.messages > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                    {unreadCounts.messages}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="announcements" className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Announcements
                {unreadCounts && unreadCounts.announcements > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                    {unreadCounts.announcements}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="messages" className="flex-1 m-0 overflow-hidden">
            <div className="h-full flex">
              <ConversationsList 
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
              />
              <ChatArea conversationId={selectedConversationId} />
            </div>
          </TabsContent>

          <TabsContent value="announcements" className="flex-1 m-0 overflow-hidden">
            <AnnouncementsList />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
