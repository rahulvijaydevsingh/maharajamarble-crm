import React, { useState } from "react";
import { useAnnouncements, useCreateAnnouncement, useMarkAnnouncementRead, Announcement } from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Plus, 
  Megaphone, 
  Pin, 
  AlertTriangle, 
  AlertCircle,
  Info,
  Loader2,
  Check
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales_user", label: "Sales User" },
  { value: "sales_viewer", label: "Sales Viewer" },
  { value: "field_agent", label: "Field Agent" },
];

export function AnnouncementsList() {
  const { isAdmin } = useAuth();
  const { data: announcements, isLoading } = useAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const markRead = useMarkAnnouncementRead();
  const { staffMembers } = useActiveStaff();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "urgent">("normal");
  const [targetAudience, setTargetAudience] = useState<"all" | "roles" | "users">("all");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return;

    await createAnnouncement.mutateAsync({
      title: title.trim(),
      content: content.trim(),
      priority,
      target_audience: targetAudience,
      target_roles: targetAudience === "roles" ? targetRoles : null,
      target_user_ids: targetAudience === "users" ? targetUserIds : null,
      is_pinned: isPinned,
      is_active: true,
      scheduled_at: null,
      published_at: null,
    });

    // Reset form
    setTitle("");
    setContent("");
    setPriority("normal");
    setTargetAudience("all");
    setTargetRoles([]);
    setTargetUserIds([]);
    setIsPinned(false);
    setCreateDialogOpen(false);
  };

  const handleMarkRead = (announcementId: string) => {
    markRead.mutate(announcementId);
  };

  const getPriorityIcon = (p: string) => {
    switch (p) {
      case "urgent": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "important": return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "urgent": return "border-l-destructive bg-destructive/5";
      case "important": return "border-l-orange-500 bg-orange-50 dark:bg-orange-950/20";
      default: return "";
    }
  };

  const toggleRole = (role: string) => {
    setTargetRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleUser = (userId: string) => {
    setTargetUserIds(prev => 
      prev.includes(userId) ? prev.filter(u => u !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="h-full flex flex-col">
      {isAdmin && (
        <div className="p-4 border-b">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Announcement</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Announcement title"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Content *</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your announcement..."
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="important">Important</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Select value={targetAudience} onValueChange={(v: any) => setTargetAudience(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Staff</SelectItem>
                        <SelectItem value="roles">Specific Roles</SelectItem>
                        <SelectItem value="users">Specific Users</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {targetAudience === "roles" && (
                  <div className="space-y-2">
                    <Label>Select Roles</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLES.map(role => (
                        <div key={role.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={role.value}
                            checked={targetRoles.includes(role.value)}
                            onCheckedChange={() => toggleRole(role.value)}
                          />
                          <label htmlFor={role.value} className="text-sm">{role.label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {targetAudience === "users" && (
                  <div className="space-y-2">
                    <Label>Select Users</Label>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      <div className="space-y-1">
                        {staffMembers.map(staff => (
                          <div key={staff.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={staff.id}
                              checked={targetUserIds.includes(staff.id)}
                              onCheckedChange={() => toggleUser(staff.id)}
                            />
                            <label htmlFor={staff.id} className="text-sm">{staff.name}</label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="pinned"
                      checked={isPinned}
                      onCheckedChange={setIsPinned}
                    />
                    <Label htmlFor="pinned">Pin to top</Label>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreate}
                    disabled={!title.trim() || !content.trim() || createAnnouncement.isPending}
                  >
                    {createAnnouncement.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Publish
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !announcements || announcements.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No announcements</h3>
              <p className="text-muted-foreground mt-1">
                There are no announcements at this time
              </p>
            </div>
          ) : (
            announcements.map(announcement => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onMarkRead={() => handleMarkRead(announcement.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface AnnouncementCardProps {
  announcement: Announcement;
  onMarkRead: () => void;
}

function AnnouncementCard({ announcement, onMarkRead }: AnnouncementCardProps) {
  const getPriorityIcon = (p: string) => {
    switch (p) {
      case "urgent": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "important": return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "urgent": return "border-l-destructive bg-destructive/5";
      case "important": return "border-l-orange-500 bg-orange-50 dark:bg-orange-950/20";
      default: return "";
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <Card className={cn("border-l-4", getPriorityColor(announcement.priority), !announcement.is_read && "ring-1 ring-primary")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {announcement.is_pinned && <Pin className="h-4 w-4 text-muted-foreground" />}
            {getPriorityIcon(announcement.priority)}
            <CardTitle className="text-lg">{announcement.title}</CardTitle>
            {!announcement.is_read && (
              <Badge variant="default" className="ml-2">New</Badge>
            )}
          </div>
          {!announcement.is_read && (
            <Button size="sm" variant="ghost" onClick={onMarkRead}>
              <Check className="h-4 w-4 mr-1" />
              Mark read
            </Button>
          )}
        </div>
        <CardDescription className="flex items-center gap-2">
          <Avatar className="h-5 w-5">
            <AvatarImage src={announcement.creator?.avatar_url || undefined} />
            <AvatarFallback className="text-[10px]">
              {getInitials(announcement.creator?.full_name)}
            </AvatarFallback>
          </Avatar>
          <span>{announcement.creator?.full_name || "Admin"}</span>
          <span>•</span>
          <span>
            {announcement.published_at 
              ? formatDistanceToNow(new Date(announcement.published_at), { addSuffix: true })
              : "Just now"
            }
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm whitespace-pre-wrap">{announcement.content}</p>
      </CardContent>
    </Card>
  );
}
