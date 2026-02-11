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
 import { Textarea } from '@/components/ui/textarea';
 import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
 import { Calendar } from '@/components/ui/calendar';
 import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { format, addHours, addDays } from 'date-fns';
 import { CalendarIcon, Clock } from 'lucide-react';
 import type { KitTouch } from '@/constants/kitConstants';
 import { KIT_TOUCH_METHOD_ICONS } from '@/constants/kitConstants';
 import { cn } from '@/lib/utils';
 
 interface KitTouchCompleteDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   touch: KitTouch | null;
   entityName: string;
   onComplete: (outcome: string, notes?: string) => Promise<void>;
   onSnooze: (snoozeUntil: string) => Promise<void>;
   onReschedule: (newDate: string) => Promise<void>;
   isLoading?: boolean;
 }
 
 const OUTCOMES = [
   { value: 'connected', label: 'Connected', description: 'Spoke successfully', requiresFollowup: false },
   { value: 'not_reachable', label: 'Not Reachable', description: 'No answer / voicemail', requiresFollowup: true },
   { value: 'callback', label: 'Callback Requested', description: 'Busy, call later', requiresFollowup: true },
   { value: 'positive', label: 'Positive Response', description: 'Showed interest', requiresFollowup: false },
   { value: 'invalid', label: 'Invalid Contact', description: 'Wrong number / declined', requiresFollowup: false },
 ];
 
 const SNOOZE_OPTIONS = [
   { value: '1h', label: '1 hour', getFn: () => addHours(new Date(), 1) },
   { value: '2h', label: '2 hours', getFn: () => addHours(new Date(), 2) },
   { value: '4h', label: '4 hours', getFn: () => addHours(new Date(), 4) },
   { value: 'tomorrow', label: 'Tomorrow', getFn: () => addDays(new Date(), 1) },
 ];
 
 export function KitTouchCompleteDialog({
   open,
   onOpenChange,
   touch,
   entityName,
   onComplete,
   onSnooze,
   onReschedule,
   isLoading = false,
 }: KitTouchCompleteDialogProps) {
   const [outcome, setOutcome] = useState<string>('');
   const [notes, setNotes] = useState('');
   const [followupAction, setFollowupAction] = useState<'none' | 'snooze' | 'reschedule'>('none');
   const [snoozeOption, setSnoozeOption] = useState<string>('2h');
   const [rescheduleDate, setRescheduleDate] = useState<Date>();
   
   if (!touch) return null;
   
   const Icon = KIT_TOUCH_METHOD_ICONS[touch.method];
   const selectedOutcome = OUTCOMES.find(o => o.value === outcome);
   const requiresFollowup = selectedOutcome?.requiresFollowup || false;
   
   const handleSubmit = async () => {
     if (!outcome) return;
     
     if (requiresFollowup && followupAction === 'snooze') {
       const option = SNOOZE_OPTIONS.find(o => o.value === snoozeOption);
       if (option) {
         await onSnooze(option.getFn().toISOString());
       }
     } else if (requiresFollowup && followupAction === 'reschedule' && rescheduleDate) {
       await onReschedule(format(rescheduleDate, 'yyyy-MM-dd'));
     } else {
       await onComplete(outcome, notes || undefined);
     }
     
     // Reset state
     setOutcome('');
     setNotes('');
     setFollowupAction('none');
     onOpenChange(false);
   };
   
   return (
       <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="max-w-md z-[100]" hideOverlay>
         <DialogHeader>
           <DialogTitle>Log Touch Outcome</DialogTitle>
         </DialogHeader>
         
         <div className="space-y-4">
           <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
             <Icon className="h-5 w-5 text-muted-foreground" />
             <div>
               <p className="font-medium capitalize">{touch.method}</p>
               <p className="text-sm text-muted-foreground">{entityName}</p>
             </div>
           </div>
           
           <div className="space-y-3">
             <Label>Outcome</Label>
             <RadioGroup value={outcome} onValueChange={setOutcome}>
               {OUTCOMES.map((o) => (
                 <div key={o.value} className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
                   <RadioGroupItem value={o.value} id={o.value} />
                   <Label htmlFor={o.value} className="flex-1 cursor-pointer">
                     <span className="font-medium">{o.label}</span>
                     <span className="text-muted-foreground text-sm ml-2">({o.description})</span>
                   </Label>
                 </div>
               ))}
             </RadioGroup>
           </div>
           
           <div className="space-y-2">
             <Label htmlFor="notes">Notes (optional)</Label>
             <Textarea
               id="notes"
               value={notes}
               onChange={(e) => setNotes(e.target.value)}
               placeholder="Add any notes about this interaction..."
               rows={2}
             />
           </div>
           
           {requiresFollowup && (
             <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
               <Label>Follow-up Action</Label>
               <RadioGroup value={followupAction} onValueChange={(v) => setFollowupAction(v as any)}>
                 <div className="flex items-center space-x-3">
                   <RadioGroupItem value="none" id="none" />
                   <Label htmlFor="none" className="cursor-pointer">Continue to next touch</Label>
                 </div>
                 <div className="flex items-center space-x-3">
                   <RadioGroupItem value="snooze" id="snooze" />
                   <Label htmlFor="snooze" className="cursor-pointer flex items-center gap-2">
                     <Clock className="h-4 w-4" />
                     Snooze for:
                   </Label>
                   {followupAction === 'snooze' && (
                     <Select value={snoozeOption} onValueChange={setSnoozeOption}>
                       <SelectTrigger className="w-32 h-8">
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent className="z-[200]">
                         {SNOOZE_OPTIONS.map((opt) => (
                           <SelectItem key={opt.value} value={opt.value}>
                             {opt.label}
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   )}
                 </div>
                 <div className="flex items-center space-x-3">
                   <RadioGroupItem value="reschedule" id="reschedule" />
                   <Label htmlFor="reschedule" className="cursor-pointer flex items-center gap-2">
                     <CalendarIcon className="h-4 w-4" />
                     Reschedule to:
                   </Label>
                   {followupAction === 'reschedule' && (
                     <Popover>
                       <PopoverTrigger asChild>
                         <Button
                           variant="outline"
                           size="sm"
                           className={cn('w-32', !rescheduleDate && 'text-muted-foreground')}
                         >
                           {rescheduleDate ? format(rescheduleDate, 'MMM d') : 'Pick date'}
                         </Button>
                       </PopoverTrigger>
                       <PopoverContent className="w-auto p-0 z-[200]" align="start">
                         <Calendar
                           mode="single"
                           selected={rescheduleDate}
                           onSelect={setRescheduleDate}
                           disabled={(date) => date < new Date()}
                         />
                       </PopoverContent>
                     </Popover>
                   )}
                 </div>
               </RadioGroup>
             </div>
           )}
         </div>
         
         <DialogFooter>
           <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
             Cancel
           </Button>
           <Button
             onClick={handleSubmit}
             disabled={!outcome || isLoading || (requiresFollowup && followupAction === 'reschedule' && !rescheduleDate)}
           >
             {isLoading ? 'Saving...' : 'Save & Continue'}
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }