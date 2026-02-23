import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveStaff } from '@/hooks/useActiveStaff';
import { buildStaffGroups } from '@/lib/staffSelect';
import { KIT_TOUCH_METHODS, type KitTouch, type KitTouchMethod } from '@/constants/kitConstants';

interface EditTouchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  touch: KitTouch | null;
  onSave: (data: {
    method: KitTouchMethod;
    scheduledDate: string;
    scheduledTime?: string;
    assignedTo: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function EditTouchDialog({
  open,
  onOpenChange,
  touch,
  onSave,
  isLoading = false,
}: EditTouchDialogProps) {
  const [method, setMethod] = useState<KitTouchMethod>('call');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState('');

  const { staffMembers } = useActiveStaff();
  const staffGroups = buildStaffGroups(staffMembers);

  // Initialize form when touch changes
  useEffect(() => {
    if (touch) {
      setMethod(touch.method);
      setScheduledDate(parseISO(touch.scheduled_date));
      setScheduledTime(touch.scheduled_time || '');
      setAssignedTo(touch.assigned_to);
    }
  }, [touch]);

  const handleSubmit = async () => {
    if (!scheduledDate) return;
    
    await onSave({
      method,
      scheduledDate: format(scheduledDate, 'yyyy-MM-dd'),
      scheduledTime: scheduledTime || undefined,
      assignedTo,
    });
    
    onOpenChange(false);
  };

  if (!touch) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[100]" hideOverlay>
        <DialogHeader>
          <DialogTitle>Edit Touch</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Touch Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as KitTouchMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {KIT_TOUCH_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Scheduled Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left', !scheduledDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduledDate ? format(scheduledDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[200]" align="start">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={setScheduledDate}
                  disabled={(date) => date < new Date()}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Time (optional)</Label>
            <Input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]">
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!scheduledDate || isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
