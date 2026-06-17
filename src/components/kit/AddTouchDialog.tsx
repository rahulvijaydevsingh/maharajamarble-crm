import React, { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { format, addDays } from 'date-fns';
import { CalendarIcon, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveStaff } from '@/hooks/useActiveStaff';
import { buildStaffGroups } from '@/lib/staffSelect';
import { KIT_TOUCH_METHODS, type KitTouchMethod } from '@/constants/kitConstants';

interface AddTouchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string;
  defaultAssignee: string;
  entityName: string;
  onAdd: (data: {
    method: KitTouchMethod;
    scheduledDate: string;
    scheduledTime?: string;
    assignedTo: string;
    createTask?: boolean;
    taskTitle?: string;
    createReminder?: boolean;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function AddTouchDialog({
  open,
  onOpenChange,
  subscriptionId,
  defaultAssignee,
  entityName,
  onAdd,
  isLoading = false,
}: AddTouchDialogProps) {
  const [method, setMethod] = useState<KitTouchMethod>('call');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(addDays(new Date(), 1));
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState(defaultAssignee);
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [createReminder, setCreateReminder] = useState(false);

  const { staffMembers } = useActiveStaff();
  const staffGroups = buildStaffGroups(staffMembers);

  const handleSubmit = async () => {
    if (!scheduledDate) return;
    
    await onAdd({
      method,
      scheduledDate: format(scheduledDate, 'yyyy-MM-dd'),
      scheduledTime: scheduledTime || undefined,
      assignedTo,
      createTask,
      taskTitle: createTask ? (taskTitle || `Follow up with ${entityName}`) : undefined,
      createReminder: createTask && createReminder,
    });
    
    // Reset form
    setMethod('call');
    setScheduledDate(addDays(new Date(), 1));
    setScheduledTime('');
    setAssignedTo(defaultAssignee);
    setCreateTask(false);
    setTaskTitle('');
    setCreateReminder(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[100]" hideOverlay>
        <DialogHeader>
          <DialogTitle>Add Touch to Cycle</DialogTitle>
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

          {/* Task/Reminder creation */}
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="createTask"
                checked={createTask}
                onCheckedChange={(checked) => {
                  setCreateTask(checked === true);
                  if (!checked) setCreateReminder(false);
                }}
              />
              <Label htmlFor="createTask" className="cursor-pointer">Create Task</Label>
            </div>

            {createTask && (
              <div className="ml-6 space-y-3">
                <Input
                  placeholder={`KIT for - ${entityName} - Call`}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="createReminder"
                    checked={createReminder}
                    onCheckedChange={(checked) => setCreateReminder(checked === true)}
                  />
                  <Label htmlFor="createReminder" className="cursor-pointer text-sm">
                    Create Reminder for Task
                  </Label>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!scheduledDate || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Touch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
