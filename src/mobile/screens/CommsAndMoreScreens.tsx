/**
 * Mobile workspace screens — internal messaging, the "More" hub and the
 * full-CRM handoff placeholder.
 *
 * Everything rendered here is live data:
 *  - conversations / messages / announcements → `@/hooks/useChat`
 *  - identity + sign out                     → `@/contexts/AuthContext`
 *  - role gating                             → `@/hooks/usePermissions`
 *  - staff directory                         → `@/hooks/useActiveStaff`
 *  - offline queue                           → `@/mobile/outbox/WeakSignalOutboxContext`
 *
 * Realtime: **no channel is opened in this file.** `useMessages()` already
 * subscribes through the shared `@/lib/realtimeRegistry`, so opening a second
 * `supabase.channel()` here would duplicate every message event.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronRight,
  Clock,
  CloudOff,
  Database,
  FileBarChart2,
  FileSpreadsheet,
  Info,
  KeyRound,
  LogOut,
  Megaphone,
  MessageSquare,
  Monitor,
  Paperclip,
  Pin,
  Send,
  ShieldCheck,
  Sliders,
  UserCheck,
  UserPlus,
  WifiOff,
  Workflow,
} from 'lucide-react';

import {
  useAnnouncements,
  useConversations,
  useMarkAnnouncementRead,
  useMarkMessagesRead,
  useMessages,
  useSendMessage,
  useUnreadCounts,
  type Announcement,
  type Conversation,
  type Message,
} from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveStaffOptions } from '@/hooks/useActiveStaff';
import { useReminders } from '@/hooks/useReminders';

import { FullCrmHandoffPanel } from '@/mobile/components/FullCrmHandoffPanel';
import { SubHeader } from '@/mobile/shell/MobileShell';
import { useWeakSignalOutbox } from '@/mobile/outbox/WeakSignalOutboxContext';
import { clearOutboxStorageForUser } from '@/mobile/outbox/weakSignalOutbox';
import { clearPendingCallForUser } from '@/mobile/hooks/useCallIntentWatcher';
import { formatShortDateTime } from '@/mobile/lib/format';
import {
  formatAttendanceHours,
  formatAttendanceTime,
  type AttendanceUiState,
} from '@/mobile/lib/clockMode';
import { openFullCrmRoute } from '@/mobile/routing/handoffHelper';
import { buildHandoffRows } from '@/mobile/lib/roleGating';
import { buildMobilePath, writeWorkspacePreference } from '@/mobile/routing/workspacePreference';
import type { MobileRoute } from '@/mobile/types/crmTypes';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Build version shown in the "More" hub. */
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || '1.0.0';

/** Stable empty collections so the memo dependencies never change identity. */
const NO_CONVERSATIONS: Conversation[] = [];
const NO_MESSAGES: Message[] = [];
const NO_ANNOUNCEMENTS: Announcement[] = [];

/** `field_agent` → `Field Agent`. */
function roleLabel(role?: string | null): string {
  if (!role) return '';
  return role
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Two-letter avatar fallback built from a live display name. */
function initialsFor(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return initials || '?';
}

/** Display name of the other side of a conversation. */
function conversationPartnerName(conversation: Conversation): string {
  return (
    conversation.other_participant?.full_name ||
    conversation.other_participant?.email ||
    'Unknown participant'
  );
}

/** Last line preview of a conversation. */
function conversationPreview(conversation: Conversation): string {
  const last = conversation.last_message;
  if (!last) return 'No messages yet';
  if (last.is_deleted) return 'Message deleted';
  return last.content || 'No messages yet';
}

/* -------------------------------------------------------------------------- */
/* Messages page                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Internal messaging: a live inbox (direct threads + announcements) and the
 * active chat view.
 *
 * Sending is guarded by the weak-signal outbox's connectivity flag — while
 * offline nothing is sent and the typed text is never discarded.
 */
export const MessagesPage: React.FC<{
  initialThreadId?: string | null;
  onBackToShell: () => void;
}> = ({ initialThreadId = null, onBackToShell }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline } = useWeakSignalOutbox();

  const [tab, setTab] = useState<'direct' | 'announcement'>('direct');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: messages, isLoading: messagesLoading } = useMessages(activeThreadId);
  const { data: unreadCounts } = useUnreadCounts();
  const { data: announcements, isLoading: announcementsLoading } = useAnnouncements();
  const { options: staffOptions } = useActiveStaffOptions();

  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const markAnnouncementRead = useMarkAnnouncementRead();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const markedKeyRef = useRef<string | null>(null);
  /**
   * The mutation object is a new object on every render, so it can never be a
   * dependency of the effect below without re-running the effect in a loop.
   * A ref keeps the latest handle without re-triggering anything.
   */
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const threadList = conversations ?? NO_CONVERSATIONS;
  const messageList = messages ?? NO_MESSAGES;
  const announcementList = announcements ?? NO_ANNOUNCEMENTS;

  /* ----------------------------- live lookups ---------------------------- */

  const staffRoleById = useMemo(() => {
    const lookup = new Map<string, string>();
    staffOptions.forEach((option) => {
      if (option.id && option.role) lookup.set(option.id, roleLabel(option.role));
    });
    return lookup;
  }, [staffOptions]);

  const activeConversation = useMemo(
    () => threadList.find((conversation) => conversation.id === activeThreadId) ?? null,
    [threadList, activeThreadId],
  );

  /* ------------------------------- effects ------------------------------- */

  // A deep link (`/m/messages/:threadId`) selects that thread immediately.
  useEffect(() => {
    if (initialThreadId) setActiveThreadId(initialThreadId);
  }, [initialThreadId]);

  // Opening a thread marks it read straight away and refreshes the unread
  // badge. `invalidateQueries` is the only cache operation used here —
  // the unread query is never removed or reset.
  useEffect(() => {
    if (!activeThreadId) {
      markedKeyRef.current = null;
      return;
    }
    const key = `${activeThreadId}:${messageList.length}`;
    if (markedKeyRef.current === key) return;
    markedKeyRef.current = key;
    // The invalidation runs in the mutation's `onSuccess`, so the unread
    // badge is refreshed *after* the write landed. Invalidating in parallel
    // resurrected the badge with the pre-write count.
    markReadRef.current.mutate(activeThreadId, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['unread-counts', user?.id] });
      },
    });
    // The mutation object is intentionally not a dependency: it is a new
    // object on every render and re-ran the effect in a loop.
  }, [activeThreadId, messageList.length, queryClient, user?.id]);

  // Keep the thread pinned to the newest message.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activeThreadId, messageList.length]);

  /* ------------------------------- handlers ------------------------------ */

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  /**
   * The selected thread is part of the URL.
   *
   * The thread used to live only in a piece of component state, so the Android
   * hardware Back button left the app instead of returning to the inbox.
   */
  const handleOpenThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setSendError(null);
    navigate(buildMobilePath({ name: 'messages', threadId }));
  };

  const handleBackToInbox = () => {
    setActiveThreadId(null);
    setSendError(null);
    navigate(buildMobilePath({ name: 'messages' }), { replace: true });
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeThreadId) return;

    // Offline guard — the typed text stays in the composer, nothing is lost.
    if (!isOnline) {
      setSendError('Offline — reconnect to send this message. Your text is kept here.');
      return;
    }

    setIsSending(true);
    try {
      await sendMessage.mutateAsync({ conversationId: activeThreadId, content: body });
      setDraft('');
      setSendError(null);
      window.requestAnimationFrame(scrollToBottom);
    } catch {
      setSendError('Message could not be sent. Your text is kept — try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkAnnouncementRead = (announcement: Announcement) => {
    if (announcement.is_read) return;
    markAnnouncementRead.mutate(announcement.id);
  };

  /* --------------------------- active chat view -------------------------- */

  if (activeThreadId) {
    const partnerName = activeConversation
      ? conversationPartnerName(activeConversation)
      : 'Conversation';
    const partnerRole = activeConversation?.other_participant?.id
      ? staffRoleById.get(activeConversation.other_participant.id) ?? ''
      : '';

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F8F9FA]">
        {/* Thread header */}
        <header className="h-14 bg-[#1A1A2E] text-white px-3 flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleBackToInbox}
            aria-label="Back to messages inbox"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-white hover:bg-white/10 active:bg-white/15 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-[#C9A84C] text-[#1A1A2E] font-utility text-xs font-bold flex items-center justify-center shrink-0">
            {initialsFor(partnerName)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-white leading-tight truncate whitespace-nowrap">
              {partnerName}
            </h1>
            {partnerRole ? (
              <p className="font-utility text-[11px] text-[#C6C4DF] leading-tight truncate whitespace-nowrap">
                {partnerRole}
              </p>
            ) : null}
          </div>
        </header>

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {messagesLoading ? (
            <p className="text-center text-sm text-[#47464C] py-8">Loading messages…</p>
          ) : messageList.length === 0 ? (
            <p className="text-center text-sm text-[#47464C] py-8">
              No messages yet — send the first one.
            </p>
          ) : (
            messageList.map((message) => {
              const isSelf = message.sender_id === user?.id;
              const senderName =
                message.sender?.full_name || message.sender?.email || 'Unknown sender';
              const isRead =
                Array.isArray(message.read_by) && message.read_by.length > 0;

              return (
                <div
                  key={message.id}
                  className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-[14px] px-3.5 py-2.5 space-y-1 ${
                      isSelf
                        ? 'bg-[#1A1A2E] text-white rounded-br-[4px]'
                        : 'bg-white border border-[#E2E8F0] text-[#191C1D] rounded-bl-[4px]'
                    }`}
                  >
                    {!isSelf && (
                      <div className="font-utility text-[11px] font-bold text-[#1A1A2E]">
                        {senderName}
                      </div>
                    )}
                    {message.is_deleted ? (
                      <p className="text-sm italic">Message deleted</p>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    )}
                    <div
                      className={`flex items-center justify-end gap-1.5 font-utility text-[10px] ${
                        isSelf ? 'text-[#C6C4DF]' : 'text-[#47464C]'
                      }`}
                    >
                      <span>{formatShortDateTime(message.created_at)}</span>
                      {isSelf &&
                        (isRead ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[#C9A84C] font-bold"
                            aria-label="Read"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>Read</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-0.5"
                            aria-label={message.delivered_at ? 'Sent' : 'Sending'}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{message.delivered_at ? 'Sent' : 'Sending'}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Flush composer pinned to the bottom of the 100dvh shell */}
        <form
          onSubmit={handleSend}
          className="shrink-0 bg-white border-t border-[#E2E8F0] px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2"
        >
          {(!isOnline || sendError) && (
            <div
              role="status"
              className="px-3 py-2 rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] text-xs font-semibold flex items-start gap-2"
            >
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {sendError ??
                  'Offline — reconnect to send. Anything you type is kept until you are back online.'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="Message text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={isOnline ? 'Type internal message…' : 'Offline — reconnect to send'}
              className="flex-1 min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-[#F8F9FA] text-base text-[#191C1D] focus:outline-none focus:border-[#1A1A2E]"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={isSending || !draft.trim()}
              className="min-h-[48px] min-w-[48px] px-4 rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold flex items-center justify-center shrink-0 disabled:opacity-60"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    );
  }

  /* ------------------------------ inbox view ----------------------------- */

  const unreadMessages = unreadCounts?.messages ?? 0;
  const unreadAnnouncements = unreadCounts?.announcements ?? 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F8F9FA]">
      <SubHeader title="Messages" onBack={onBackToShell} />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {!isOnline && (
          <div
            role="status"
            className="px-3 py-2 rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] text-xs font-semibold flex items-center gap-2"
          >
            <CloudOff className="w-4 h-4 shrink-0" />
            <span>Offline — you can read messages, but you cannot send new ones.</span>
          </div>
        )}

        {/* Segmented tabs: Direct / Announcements */}
        <div
          role="tablist"
          aria-label="Message channels"
          className="grid grid-cols-2 gap-1 p-1 rounded-[12px] bg-[#EEF2F6]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'direct'}
            onClick={() => setTab('direct')}
            className={`min-h-[44px] rounded-[10px] font-utility text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap ${
              tab === 'direct' ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#47464C]'
            }`}
          >
            <span>Direct</span>
            {unreadMessages > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#C9A84C] text-[#1A1A2E] text-[11px] whitespace-nowrap">
                {unreadMessages}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'announcement'}
            onClick={() => setTab('announcement')}
            className={`min-h-[44px] rounded-[10px] font-utility text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap ${
              tab === 'announcement' ? 'bg-white text-[#1A1A2E] shadow-sm' : 'text-[#47464C]'
            }`}
          >
            <span>Announcements</span>
            {unreadAnnouncements > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#C9A84C] text-[#1A1A2E] text-[11px] whitespace-nowrap">
                {unreadAnnouncements}
              </span>
            )}
          </button>
        </div>

        {tab === 'direct' ? (
          <div className="space-y-2.5">
            {conversationsLoading ? (
              <p className="text-center text-sm text-[#47464C] py-8">Loading conversations…</p>
            ) : threadList.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 text-center space-y-1">
                <MessageSquare className="w-7 h-7 text-[#47464C] mx-auto" />
                <p className="text-sm font-semibold text-[#1A1A2E]">No conversations yet</p>
                <p className="text-xs text-[#47464C]">
                  Start a chat from a lead, customer or professional record.
                </p>
              </div>
            ) : (
              threadList.map((conversation) => {
                const partnerName = conversationPartnerName(conversation);
                const partnerRole = conversation.other_participant?.id
                  ? staffRoleById.get(conversation.other_participant.id) ?? ''
                  : '';

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleOpenThread(conversation.id)}
                    className="w-full min-h-[56px] text-left p-4 rounded-[12px] border flex items-start gap-3 bg-white border-[#E2E8F0]"
                  >
                    <div className="w-11 h-11 rounded-full bg-[#1A1A2E] text-[#C9A84C] font-utility text-xs font-bold flex items-center justify-center shrink-0">
                      {initialsFor(partnerName)}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1A1A2E] truncate">
                          {partnerName}
                        </span>
                        <span className="font-utility text-[11px] text-[#47464C] whitespace-nowrap shrink-0">
                          {formatShortDateTime(
                            conversation.last_message_at ?? conversation.last_message?.created_at,
                          )}
                        </span>
                      </div>

                      {partnerRole && (
                        <div className="font-utility text-[11px] font-semibold text-[#47464C]">
                          {partnerRole}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-[#191C1D] line-clamp-2">
                          {conversationPreview(conversation)}
                        </p>
                        {(conversation.unread_count ?? 0) > 0 && (
                          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#C9A84C] text-[#1A1A2E] font-utility text-[11px] font-bold flex items-center justify-center shrink-0 whitespace-nowrap">
                            {conversation.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {announcementsLoading ? (
              <p className="text-center text-sm text-[#47464C] py-8">Loading announcements…</p>
            ) : announcementList.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-6 text-center space-y-1">
                <Megaphone className="w-7 h-7 text-[#47464C] mx-auto" />
                <p className="text-sm font-semibold text-[#1A1A2E]">No announcements</p>
                <p className="text-xs text-[#47464C]">
                  Announcements published for your role will show up here.
                </p>
              </div>
            ) : (
              announcementList.map((announcement) => {
                const PriorityIcon =
                  announcement.priority === 'urgent'
                    ? AlertTriangle
                    : announcement.priority === 'important'
                      ? AlertCircle
                      : Info;

                return (
                  <article
                    key={announcement.id}
                    className={`w-full bg-white border rounded-[12px] p-4 space-y-2 ${
                      announcement.is_pinned ? 'border-[#FDE68A]' : 'border-[#E2E8F0]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {announcement.is_pinned ? (
                        <Pin className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                      ) : (
                        <PriorityIcon
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            announcement.priority === 'urgent'
                              ? 'text-[#DC2626]'
                              : announcement.priority === 'important'
                                ? 'text-[#D97706]'
                                : 'text-[#47464C]'
                          }`}
                        />
                      )}
                      <h2 className="text-sm font-bold text-[#1A1A2E] flex-1 min-w-0">
                        {announcement.title}
                      </h2>
                      {!announcement.is_read && (
                        <span className="px-2 py-0.5 rounded-full bg-[#C9A84C] text-[#1A1A2E] font-utility text-[11px] font-bold whitespace-nowrap shrink-0">
                          New
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-[#191C1D] leading-relaxed whitespace-pre-wrap break-words">
                      {announcement.content}
                    </p>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="font-utility text-[11px] text-[#47464C] truncate">
                        {announcement.creator?.full_name
                          ? `${announcement.creator.full_name} · ${formatShortDateTime(
                              announcement.published_at,
                            )}`
                          : formatShortDateTime(announcement.published_at)}
                      </span>
                      {!announcement.is_read && (
                        <button
                          type="button"
                          onClick={() => handleMarkAnnouncementRead(announcement)}
                          className="min-h-[44px] px-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FA] text-xs font-semibold text-[#1A1A2E] whitespace-nowrap shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* More hub                                                                   */
/* -------------------------------------------------------------------------- */

interface HandoffRow {
  label: string;
  code: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/**
 * Icons for the handoff rows.
 *
 * The row matrix (label, target and permission gate) lives in
 * `@/mobile/lib/roleGating`; only the presentation stays here.
 */
const HANDOFF_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  'todo-lists': CheckSquare,
  quotations: FileSpreadsheet,
  'leads-new': UserPlus,
  'customers-new': UserCheck,
  'professionals-new': Building2,
  'customer-attachments': Paperclip,
  'control-panel': Sliders,
  roles: ShieldCheck,
  backup: Database,
  automation: Workflow,
  'api-docs': KeyRound,
  performance: FileBarChart2,
};

/**
 * The "More" hub: live profile card, workspace switch, mobile-only rows and
 * the role-gated full-CRM handoffs.
 */
export const MorePage: React.FC<{
  onNavigate: (route: MobileRoute) => void;
  onOpenClockModal: () => void;
  attendanceState: AttendanceUiState;
  onRetryAttendance: () => void | Promise<void>;
  onOpenNotifications: () => void;
  onOpenOutbox: () => void;
}> = ({
  onNavigate,
  onOpenClockModal,
  attendanceState,
  onRetryAttendance,
  onOpenNotifications,
  onOpenOutbox,
}) => {
  const { profile, role, signOut, user } = useAuth();
  const { hasPermission, canAccessControlPanel, canManageRoles, role: permissionRole } =
    usePermissions();
  const { outbox } = useWeakSignalOutbox();
  const { data: unreadCounts } = useUnreadCounts();
  const { reminders } = useReminders();
  const navigate = useNavigate();

  const displayName = profile?.full_name || profile?.email || 'Signed in';
  const displayRole = roleLabel(role);
  const pendingReminders = reminders.filter((reminder) => !reminder.is_dismissed).length;

  /* -------------------------- full CRM handoffs -------------------------- */

  // Desktop-only surfaces are never offered to field agents or office staff;
  // every row additionally needs the matching live permission. The decision
  // table lives in `@/mobile/lib/roleGating` so it can be unit tested.
  const handoffRows: HandoffRow[] = buildHandoffRows({
    role: permissionRole,
    // `usePermissions().hasPermission` takes the closed `Permission` union,
    // while the shared decision table works with plain permission strings.
    hasPermission: (permission) =>
      hasPermission(permission as Parameters<typeof hasPermission>[0]),
    canAccessControlPanel,
    canManageRoles,
  }).map((spec) => ({
    label: spec.label,
    code: spec.targetCode,
    Icon: HANDOFF_ICONS[spec.key] ?? Building2,
  }));

  const handleHandoff = (code: string) => {
    // A handoff must genuinely open the desktop surface — a placeholder is a
    // dead end for the field user. The stored preference is switched first so
    // the `/m` gate stops fighting the user on the way out.
    writeWorkspacePreference('desktop');
    openFullCrmRoute(code, (path) => navigate(path));
  };

  const handleSwitchToFullCrm = () => {
    writeWorkspacePreference('desktop');
    navigate('/');
  };

  /**
   * Sign out.
   *
   * The device holds queued field work and a pending call intent in
   * user-scoped storage. Signing out must wipe BOTH, otherwise the next person
   * to sign in on this handset could replay the previous user's mutations.
   */
  const handleSignOut = async () => {
    clearOutboxStorageForUser(user?.id);
    clearPendingCallForUser(user?.id);
    await signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="p-4 space-y-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {/* Live profile card */}
      <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-4 shadow-[0_1px_3px_rgba(26,26,46,0.05)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-[#1A1A2E] text-[#C9A84C] font-utility text-sm font-bold flex items-center justify-center shrink-0">
            {initialsFor(displayName)}
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-[#1A1A2E] truncate">{displayName}</h1>
            <p className="text-xs font-medium text-[#47464C] truncate">
              {displayRole || 'Field CRM'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="min-h-[44px] px-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FA] text-xs font-semibold text-[#DC2626] flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </section>

      {/* Switch to Full CRM */}
      <button
        type="button"
        onClick={handleSwitchToFullCrm}
        className="w-full min-h-[56px] text-left p-4 rounded-[12px] bg-white border-2 border-[#C9A84C] shadow-[0_1px_3px_rgba(26,26,46,0.05)] flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-[10px] bg-[#1A1A2E] text-[#C9A84C] flex items-center justify-center shrink-0">
            <Monitor className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#1A1A2E] whitespace-nowrap">
              Switch to Full CRM
            </div>
            <div className="text-xs text-[#47464C] truncate">
              Open the desktop workspace (saves preference)
            </div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-[#1A1A2E] shrink-0" />
      </button>

      {/* Mobile workspace rows */}
      <section className="space-y-2">
        <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C] px-1">
          Mobile Workspace
        </h2>
        <div className="bg-white border border-[#E2E8F0] rounded-[12px] divide-y divide-[#F1F5F9]">
          <button
            type="button"
            disabled={attendanceState.status === 'loading' || attendanceState.status === 'clocked_out'}
            onClick={attendanceState.status === 'error' ? () => void onRetryAttendance() : onOpenClockModal}
            className="w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-2 text-left disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-3 text-sm font-semibold text-[#1A1A2E] min-w-0">
              <Clock className="w-4 h-4 text-[#1A1A2E] shrink-0" />
              <span className="min-w-0">
                <span className="block">
                  {attendanceState.status === 'loading' ? 'Checking attendance…'
                    : attendanceState.status === 'error' ? 'Attendance status unavailable'
                      : attendanceState.status === 'clocked_in' ? 'Clock Out'
                        : attendanceState.status === 'clocked_out' ? 'Today Complete' : 'Clock In'}
                </span>
                {attendanceState.status === 'clocked_in' && attendanceState.record?.clock_in && (
                  <span className="block text-xs font-normal text-[#47464C]">In {formatAttendanceTime(attendanceState.record.clock_in)}</span>
                )}
                {attendanceState.status === 'clocked_out' && (
                  <span className="block text-xs font-normal text-[#47464C]">
                    {formatAttendanceTime(attendanceState.record?.clock_in)} – {formatAttendanceTime(attendanceState.record?.clock_out)}
                    {formatAttendanceHours(attendanceState.record?.total_hours) ? ` · ${formatAttendanceHours(attendanceState.record?.total_hours)}` : ''}
                  </span>
                )}
              </span>
            </span>
            <span className={`px-2.5 py-1 rounded-full font-utility text-[11px] font-bold whitespace-nowrap shrink-0 ${
              attendanceState.status === 'clocked_in' || attendanceState.status === 'clocked_out'
                ? 'bg-[#ECFDF5] text-[#059669]'
                : attendanceState.status === 'error'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-[#EEF2F6] text-[#1A1A2E]'
            }`}>
              {attendanceState.status === 'loading' ? 'Loading'
                : attendanceState.status === 'error' ? 'Tap to retry'
                  : attendanceState.status === 'clocked_in' ? 'On shift'
                    : attendanceState.status === 'clocked_out' ? 'Completed' : 'Not started'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ name: 'messages' })}
            className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-3 text-sm font-semibold text-[#1A1A2E] whitespace-nowrap">
              <MessageSquare className="w-4 h-4 text-[#1A1A2E] shrink-0" />
              <span>Internal Messages</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {(unreadCounts?.messages ?? 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#C9A84C] text-[#1A1A2E] font-utility text-[11px] font-bold whitespace-nowrap">
                  {unreadCounts?.messages}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-[#47464C]" />
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenNotifications}
            className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-3 text-sm font-semibold text-[#1A1A2E] whitespace-nowrap">
              <Bell className="w-4 h-4 text-[#1A1A2E] shrink-0" />
              <span>Notifications &amp; Reminders</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {pendingReminders > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#DC2626] text-white font-utility text-[11px] font-bold whitespace-nowrap">
                  {pendingReminders}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-[#47464C]" />
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenOutbox}
            className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-3 text-sm font-semibold text-[#1A1A2E] whitespace-nowrap">
              <CloudOff className="w-4 h-4 text-[#1A1A2E] shrink-0" />
              <span>Pending Sync Outbox</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-utility text-xs font-bold text-[#47464C] whitespace-nowrap">
                {outbox.length}
              </span>
              <ChevronRight className="w-4 h-4 text-[#47464C]" />
            </span>
          </button>
        </div>
      </section>

      {/* Role-gated full CRM handoffs */}
      {handoffRows.length > 0 && (
        <section className="space-y-2 pb-2">
          <h2 className="font-utility text-xs font-bold uppercase tracking-wider text-[#47464C] px-1">
            Full CRM Handoffs
          </h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] divide-y divide-[#F1F5F9]">
            {handoffRows.map(({ label, code, Icon }) => (
              <button
                key={`${code}-${label}`}
                type="button"
                onClick={() => handleHandoff(code)}
                className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-2 text-left"
              >
                <span className="flex items-center gap-3 text-sm font-semibold text-[#1A1A2E] min-w-0">
                  <Icon className="w-4 h-4 text-[#1A1A2E] shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
                <span className="font-utility text-xs text-[#47464C] flex items-center gap-1 whitespace-nowrap shrink-0">
                  <span>Full CRM</span>
                  <ChevronRight className="w-4 h-4" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* App version */}
      <p className="text-center font-utility text-[11px] text-[#47464C] whitespace-nowrap">
        Maharaja Marble CRM · Field workspace v{APP_VERSION}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Full CRM handoff view                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Thin wrapper around `FullCrmHandoffPanel` — the desktop-only surface itself
 * is never re-implemented inside the mobile workspace.
 */
export const FullCrmHandoffView: React.FC<{
  targetLabel: string;
  targetCode: string;
  isWorkspaceSwitch?: boolean;
  onReturnToMobile: () => void;
}> = ({ targetLabel, targetCode, isWorkspaceSwitch, onReturnToMobile }) => {
  return (
    <FullCrmHandoffPanel
      targetLabel={targetLabel}
      targetCode={targetCode}
      isWorkspaceSwitch={isWorkspaceSwitch}
      onReturnToMobile={onReturnToMobile}
    />
  );
};
