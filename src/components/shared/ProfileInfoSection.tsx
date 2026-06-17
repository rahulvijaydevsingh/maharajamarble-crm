import React, { ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface InfoFieldProps {
  label: string;
  children: ReactNode;
}

export function InfoField({ label, children }: InfoFieldProps) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

interface StatusDropdownProps {
  value: string;
  statuses: Record<string, { label: string; className: string }>;
  onChange: (value: string) => Promise<void>;
  disabled?: boolean;
}

export function StatusDropdown({ value, statuses, onChange, disabled }: StatusDropdownProps) {
  const [updating, setUpdating] = useState(false);
  const statusConfig = statuses[value] || { label: value, className: 'bg-gray-100 text-gray-700' };

  const handleChange = async (newValue: string) => {
    setUpdating(true);
    try {
      await onChange(newValue);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || updating}>
      <SelectTrigger className="w-40">
        <SelectValue>
          <Badge variant="secondary" className={statusConfig.className}>
            {updating && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {statusConfig.label}
          </Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(statuses).map(([key, config]) => (
          <SelectItem key={key} value={key}>
            <Badge variant="secondary" className={config.className}>
              {config.label}
            </Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface AssigneeDisplayProps {
  name: string;
}

export function AssigneeDisplay({ name }: AssigneeDisplayProps) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      {name}
    </div>
  );
}

interface LatestActivityProps {
  assignedTo: string;
  action: string;
  relativeTime: string;
  onViewActivityLog?: () => void;
}

export function LatestActivity({ assignedTo, action, relativeTime, onViewActivityLog }: LatestActivityProps) {
  const initials = assignedTo.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 text-sm">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <span className="font-medium">{assignedTo}</span>
          <span className="text-muted-foreground"> - {action}</span>
          <div className="text-xs text-muted-foreground">{relativeTime}</div>
        </div>
      </div>
    </div>
  );
}
