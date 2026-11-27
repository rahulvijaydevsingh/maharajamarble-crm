import React, { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';

import { ClockInOutModal } from '@/components/hr/ClockInOutModal';
import { useHRModule } from '@/contexts/HRModuleContext';
import { useAuth } from '@/contexts/AuthContext';
import type { AttendanceShiftStatus } from '@/mobile/lib/clockMode';

/**
 * Mobile counterpart of the desktop `FirstLoginClockInPrompt`.
 *
 * The desktop prompt shows when
 *   `sessionStorage["should_prompt_clock_in"] === "true"`
 *   AND the HR module is enabled
 *   AND the role is not `sales_viewer`.
 *
 * This guard mirrors that gate exactly and then opens the **live**
 * `src/components/hr/ClockInOutModal` (which captures the camera frame and
 * compresses it through `src/lib/imageCompression.ts` — 1024px longest edge,
 * ≤200 KB JPEG). The prototype's stub clock-in modal is not used.
 *
 * Unlike the desktop prompt, the mobile version renders a non-blocking banner
 * instead of a modal dialog: a field agent working in a noisy environment
 * should be able to ignore it and continue.
 */

export const ATTENDANCE_PROMPT_STORAGE_KEY = 'should_prompt_clock_in';

export interface AttendancePromptGuardProps {
  attendanceStatus?: AttendanceShiftStatus;
  onClockSuccess?: () => void | Promise<void>;
}

export const AttendancePromptGuard: React.FC<AttendancePromptGuardProps> = ({
  attendanceStatus,
  onClockSuccess,
}) => {
  const { hrEnabled } = useHRModule();
  const { role } = useAuth();
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (sessionStorage.getItem(ATTENDANCE_PROMPT_STORAGE_KEY) !== 'true') return;
    if (!hrEnabled) return;
    if (role === 'sales_viewer') return;

    setVisible(true);
    // The desktop prompt consumes the flag when it reads it, so it only ever
    // appears once per login. Mirror that exactly.
    sessionStorage.removeItem(ATTENDANCE_PROMPT_STORAGE_KEY);
  }, [hrEnabled, role]);

  useEffect(() => {
    if (attendanceStatus === 'clocked_in' || attendanceStatus === 'clocked_out') {
      setVisible(false);
      setModalOpen(false);
    }
  }, [attendanceStatus]);

  if (!visible) return null;

  return (
    <>
      <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-3.5 shadow-[0_1px_3px_rgba(26,26,46,0.05)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A] flex items-center justify-center text-[#D97706] shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1A1A2E] leading-snug">
              Shift not clocked in
            </p>
            <p className="text-xs text-[#47464C]">Mark daily attendance</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="min-h-[44px] px-3.5 rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-sm whitespace-nowrap"
          >
            Clock In
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Dismiss attendance prompt"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[10px] text-[#47464C] hover:bg-[#F3F4F5]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ClockInOutModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode="clock-in"
        onSuccess={() => {
          setVisible(false);
          setModalOpen(false);
          void onClockSuccess?.();
        }}
      />
    </>
  );
};

export default AttendancePromptGuard;
