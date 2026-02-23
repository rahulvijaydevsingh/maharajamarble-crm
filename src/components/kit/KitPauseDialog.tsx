 import React, { useState } from 'react';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogFooter,
   DialogDescription,
 } from '@/components/ui/dialog';
 import { Button } from '@/components/ui/button';
 import { Label } from '@/components/ui/label';
 import { Textarea } from '@/components/ui/textarea';
 import { Calendar } from '@/components/ui/calendar';
 import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
 import { Switch } from '@/components/ui/switch';
 import { format } from 'date-fns';
 import { CalendarIcon, Loader2 } from 'lucide-react';
 import { cn } from '@/lib/utils';
 
 interface KitPauseDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onPause: (pauseUntil?: string, pauseReason?: string) => Promise<void>;
   isLoading?: boolean;
 }
 
 export function KitPauseDialog({
   open,
   onOpenChange,
   onPause,
   isLoading = false,
 }: KitPauseDialogProps) {
   const [reason, setReason] = useState('');
   const [useAutoResume, setUseAutoResume] = useState(false);
   const [resumeDate, setResumeDate] = useState<Date>();
   
   const handlePause = async () => {
     await onPause(
       useAutoResume && resumeDate ? resumeDate.toISOString() : undefined,
       reason || undefined
     );
     setReason('');
     setUseAutoResume(false);
     setResumeDate(undefined);
     onOpenChange(false);
   };
   
   return (
       <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="max-w-md z-[100]" hideOverlay>
         <DialogHeader>
           <DialogTitle>Pause Keep in Touch</DialogTitle>
           <DialogDescription>
             Temporarily pause the touch sequence. You can resume at any time.
           </DialogDescription>
         </DialogHeader>
         
         <div className="space-y-4">
           <div className="space-y-2">
             <Label htmlFor="reason">Reason (optional)</Label>
             <Textarea
               id="reason"
               value={reason}
               onChange={(e) => setReason(e.target.value)}
               placeholder="Why are you pausing this sequence?"
               rows={2}
             />
           </div>
           
           <div className="flex items-center justify-between">
             <div className="space-y-0.5">
               <Label>Auto-resume</Label>
               <p className="text-xs text-muted-foreground">
                 Automatically resume on a specific date
               </p>
             </div>
             <Switch
               checked={useAutoResume}
               onCheckedChange={setUseAutoResume}
             />
           </div>
           
           {useAutoResume && (
             <div className="space-y-2">
               <Label>Resume Date</Label>
               <Popover>
                 <PopoverTrigger asChild>
                   <Button
                     variant="outline"
                     className={cn(
                       'w-full justify-start text-left font-normal',
                       !resumeDate && 'text-muted-foreground'
                     )}
                   >
                     <CalendarIcon className="mr-2 h-4 w-4" />
                     {resumeDate ? format(resumeDate, 'PPP') : 'Select a date'}
                   </Button>
                 </PopoverTrigger>
                 <PopoverContent className="w-auto p-0 z-[200]" align="start">
                   <Calendar
                     mode="single"
                     selected={resumeDate}
                     onSelect={setResumeDate}
                     disabled={(date) => date <= new Date()}
                   />
                 </PopoverContent>
               </Popover>
             </div>
           )}
         </div>
         
         <DialogFooter>
           <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
             Cancel
           </Button>
           <Button
             onClick={handlePause}
             disabled={isLoading || (useAutoResume && !resumeDate)}
             variant="destructive"
           >
             {isLoading ? (
               <>
                 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                 Pausing...
               </>
             ) : (
               'Pause'
             )}
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }