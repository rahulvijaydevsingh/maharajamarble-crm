import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { format, parseISO, isPast, isToday, addHours, addDays } from 'date-fns';
import { Check, Clock, CalendarDays, SkipForward, User, Phone, MessageCircle, MapPin, Pencil } from 'lucide-react';
import type { KitTouch } from '@/constants/kitConstants';
import {
  KIT_TOUCH_METHOD_ICONS,
  KIT_TOUCH_METHOD_COLORS,
  KIT_TOUCH_STATUS_COLORS,
  KIT_TOUCH_STATUS_LABELS,
} from '@/constants/kitConstants';
import { PhoneLink } from '@/components/shared/PhoneLink';
import { PlusCodeLink } from '@/components/shared/PlusCodeLink';
import { cn } from '@/lib/utils';
import { useActiveStaff } from '@/hooks/useActiveStaff';
import { buildStaffGroups } from '@/lib/staffSelect';
import { getStaffDisplayName } from '@/lib/kitHelpers';

interface KitTouchCardProps {
  touch: KitTouch;
  onComplete: () => void;
  onSnooze?: (snoozeUntil: string) => void;
  onReschedule?: (newDate: string) => void;
  onSkip?: () => void;
  onReassign?: (newAssignee: string) => void;
  onEdit?: () => void;
  isUpcoming?: boolean;
  disabled?: boolean;
  entityPhone?: string;
  entityLocation?: string;
}

const SNOOZE_OPTIONS = [
  { value: '1h', label: '1 hour', getFn: () => addHours(new Date(), 1) },
  { value: '2h', label: '2 hours', getFn: () => addHours(new Date(), 2) },
  { value: '4h', label: '4 hours', getFn: () => addHours(new Date(), 4) },
  { value: 'tomorrow', label: 'Tomorrow', getFn: () => addDays(new Date(), 1) },
];

function getWhatsAppLink(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  return `https://wa.me/${normalized}`;
}

export function KitTouchCard({
  touch,
  onComplete,
  onSnooze,
  onReschedule,
  onSkip,
  onReassign,
  onEdit,
  isUpcoming = false,
  disabled = false,
  entityPhone,
  entityLocation,
}: KitTouchCardProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date>();
  const { staffMembers } = useActiveStaff();
  const staffGroups = buildStaffGroups(staffMembers);
  const displayName = getStaffDisplayName(touch.assigned_to, staffMembers);
  const Icon = KIT_TOUCH_METHOD_ICONS[touch.method];
  const methodColor = KIT_TOUCH_METHOD_COLORS[touch.method];
  const statusColor = KIT_TOUCH_STATUS_COLORS[touch.status];
  const statusLabel = KIT_TOUCH_STATUS_LABELS[touch.status];
  
  const scheduledDate = parseISO(touch.scheduled_date);
  const isOverdue = isPast(scheduledDate) && !isToday(scheduledDate) && touch.status === 'pending';
  const isDueToday = isToday(scheduledDate) && touch.status === 'pending';

  const handleSnooze = (value: string) => {
    const option = SNOOZE_OPTIONS.find(o => o.value === value);
    if (option && onSnooze) {
      onSnooze(option.getFn().toISOString());
    }
  };

  const handleReschedule = () => {
    if (rescheduleDate && onReschedule) {
      onReschedule(format(rescheduleDate, 'yyyy-MM-dd'));
      setRescheduleOpen(false);
      setRescheduleDate(undefined);
    }
  };

  const handleReassign = (newAssignee: string) => {
    if (onReassign) {
      onReassign(newAssignee);
      setReassignOpen(false);
    }
  };

  // Render the method name as a clickable link
  const renderMethodWithLink = () => {
    const methodLabel = touch.method.charAt(0).toUpperCase() + touch.method.slice(1);
    
    if (touch.method === 'call' && entityPhone) {
      return (
        <a href={`tel:${entityPhone}`} className="font-medium hover:underline text-primary">
          {methodLabel}
        </a>
      );
    }
    if (touch.method === 'whatsapp' && entityPhone) {
      return (
        <a 
          href={getWhatsAppLink(entityPhone)} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="font-medium hover:underline text-primary"
        >
          {methodLabel}
        </a>
      );
    }
    if (touch.method === 'visit') {
      if (entityLocation) {
        return (
          <PlusCodeLink plusCode={entityLocation} className="font-medium" />
        );
      }
      return <span className="font-medium">{methodLabel}</span>;
    }
    return <span className="font-medium capitalize">{methodLabel}</span>;
  };

  // Render contact links based on method
  const renderContactLinks = () => {
    if (!entityPhone && !entityLocation) return null;
    
    return (
      <div className="flex items-center gap-2 mt-2">
        {touch.method === 'call' && entityPhone && (
          <span className="inline-flex items-center text-xs">
            <Phone className="h-3 w-3 mr-1" />
            <PhoneLink phone={entityPhone} className="text-xs" />
          </span>
        )}
        {touch.method === 'whatsapp' && entityPhone && (
          <a
            href={getWhatsAppLink(entityPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs text-primary hover:underline"
          >
            <MessageCircle className="h-3 w-3 mr-1" />
            WhatsApp
          </a>
        )}
        {touch.method === 'visit' && entityLocation && (
          <span className="inline-flex items-center text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            <PlusCodeLink plusCode={entityLocation} className="text-xs" />
          </span>
        )}
      </div>
    );
  };
  
  return (
    <Card className={cn(isOverdue && 'border-destructive/50 bg-destructive/5')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn('p-2 rounded-lg', methodColor)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {renderMethodWithLink()}
                {touch.status !== 'pending' && (
                  <Badge variant="secondary" className={cn('text-xs', statusColor)}>
                    {statusLabel}
                  </Badge>
                )}
                {isOverdue && (
                  <Badge variant="destructive" className="text-xs">
                    Overdue
                  </Badge>
                )}
                {isDueToday && (
                  <Badge className="text-xs bg-primary/10 text-primary">
                    Due Today
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(scheduledDate, 'MMM d, yyyy')}
                {touch.scheduled_time && ` at ${touch.scheduled_time}`}
              </div>
              
              {/* Assignee display with reassign option */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>{displayName}</span>
                {touch.status === 'pending' && !isUpcoming && onReassign && (
                  <Popover open={reassignOpen} onOpenChange={setReassignOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 px-2 text-xs">
                        Reassign
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 z-[100]" align="start">
                      <Select onValueChange={handleReassign}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select staff..." />
                        </SelectTrigger>
                        <SelectContent className="z-[100]">
                          {staffGroups.map((group) => (
                            <SelectGroup key={group.label}>
                              <SelectLabel>{group.label}</SelectLabel>
                              {group.members.map((member) => (
                                <SelectItem key={member.id} value={member.email || member.id}>
                                  {member._display}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              
              {/* Contact links */}
              {renderContactLinks()}
              
              {touch.outcome && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Outcome:</span>{' '}
                  <span className="font-medium">{touch.outcome}</span>
                </div>
              )}
              {touch.outcome_notes && (
                <p className="text-sm text-muted-foreground mt-1">
                  {touch.outcome_notes}
                </p>
              )}
            </div>
          </div>
          
          {touch.status === 'pending' && !isUpcoming && (
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      onClick={onComplete}
                      disabled={disabled}
                      className="gap-1"
                    >
                      <Check className="h-4 w-4" />
                      Log
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Log touch outcome</TooltipContent>
                </Tooltip>
                
                {/* Edit Button */}
                {onEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={onEdit} disabled={disabled}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit touch</TooltipContent>
                  </Tooltip>
                )}
                
                {/* Direct Snooze Dropdown */}
                {onSnooze && (
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" disabled={disabled}>
                            <Clock className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Snooze</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="z-[100]">
                      {SNOOZE_OPTIONS.map((opt) => (
                        <DropdownMenuItem key={opt.value} onClick={() => handleSnooze(opt.value)}>
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                
                {/* Direct Reschedule Popover */}
                {onReschedule && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="outline" disabled={disabled}>
                            <CalendarDays className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[100]" align="end">
                          <Calendar
                            mode="single"
                            selected={rescheduleDate}
                            onSelect={setRescheduleDate}
                            disabled={(date) => date < new Date()}
                            className="p-3 pointer-events-auto"
                          />
                          {rescheduleDate && (
                            <div className="p-3 border-t">
                              <Button size="sm" onClick={handleReschedule} className="w-full">
                                Reschedule to {format(rescheduleDate, 'MMM d')}
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </TooltipTrigger>
                    <TooltipContent>Reschedule</TooltipContent>
                  </Tooltip>
                )}
                
                {onSkip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onSkip}
                        disabled={disabled}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Skip touch</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
