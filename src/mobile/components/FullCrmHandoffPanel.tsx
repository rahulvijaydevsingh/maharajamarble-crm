import React from 'react';
import { ArrowLeft, Building2, Smartphone } from 'lucide-react';

export interface FullCrmHandoffPanelProps {
  targetLabel: string;
  targetCode: string;
  isWorkspaceSwitch?: boolean;
  onReturnToMobile: () => void;
}

/**
 * The placeholder shown when the mobile workspace hands a task over to the
 * full desktop CRM.
 *
 * It deliberately renders only the handoff itself — the desktop surface is
 * opened by the router, not re-implemented here.
 */
export const FullCrmHandoffPanel: React.FC<FullCrmHandoffPanelProps> = ({
  targetLabel,
  targetCode,
  isWorkspaceSwitch,
  onReturnToMobile,
}) => {
  return (
    <div className="min-h-[100dvh] bg-[#F8F9FA] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-[#E2E8F0] rounded-[12px] p-5 space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-[#EEF2F6] border border-[#E2E8F0] flex items-center justify-center text-[#1A1A2E]">
          <Building2 className="w-6 h-6" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-[#1A1A2E]">{targetLabel}</h2>
          <p className="text-sm text-[#47464C]">
            {isWorkspaceSwitch
              ? 'The full CRM opens in the desktop workspace.'
              : 'This screen is available in the full CRM workspace.'}
          </p>
          {targetCode ? (
            <p className="font-utility text-[11px] text-[#47464C] break-all">{targetCode}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onReturnToMobile}
          className="w-full min-h-[48px] rounded-[12px] bg-[#C9A84C] text-[#1A1A2E] font-semibold text-base flex items-center justify-center gap-2"
        >
          <Smartphone className="w-4 h-4" />
          <span>Back to Mobile Workspace</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Compact variant used by the `More` hub, where the handoff is a list row
 * rather than a full screen.
 */
export const FullCrmHandoffRow: React.FC<{
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}> = ({ label, onClick, icon }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[48px] px-3.5 rounded-[12px] border border-[#E2E8F0] bg-white flex items-center justify-between text-sm font-semibold text-[#1A1A2E]"
    >
      <span className="flex items-center gap-2.5">
        {icon ?? <ArrowLeft className="w-4 h-4 text-[#1A1A2E]" />}
        <span>{label}</span>
      </span>
      <span className="font-utility text-xs text-[#47464C]">Desktop →</span>
    </button>
  );
};
