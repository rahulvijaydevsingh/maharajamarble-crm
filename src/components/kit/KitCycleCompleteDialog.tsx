import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Square, Loader2 } from 'lucide-react';

interface KitCycleCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleNumber: number;
  entityName: string;
  presetName: string;
  onRepeat: () => Promise<void>;
  onStop: () => Promise<void>;
  isLoading?: boolean;
}

export function KitCycleCompleteDialog({
  open,
  onOpenChange,
  cycleNumber,
  entityName,
  presetName,
  onRepeat,
  onStop,
  isLoading = false,
}: KitCycleCompleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[100]">
        <AlertDialogHeader>
          <AlertDialogTitle>🎉 Cycle {cycleNumber} Complete!</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              You've completed all touches in cycle {cycleNumber} of the "{presetName}" sequence for{' '}
              <span className="font-medium">{entityName}</span>.
            </p>
            <p>Would you like to start another cycle or stop the subscription?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel disabled={isLoading} onClick={onStop} className="gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            Stop Subscription
          </AlertDialogCancel>
          <AlertDialogAction onClick={onRepeat} disabled={isLoading} className="gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Start New Cycle
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
