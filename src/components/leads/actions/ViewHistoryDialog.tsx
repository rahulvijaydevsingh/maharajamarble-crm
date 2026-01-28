
import React from "react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar,
  User,
  FileText,
  Phone,
  MapPin,
  CheckCircle,
  Clock,
  Edit,
  Trash2
} from "lucide-react";

interface HistoryEvent {
  id: string;
  timestamp: string;
  type: 'created' | 'status_change' | 'follow_up' | 'task_completed' | 'quotation' | 'note_added';
  user: string;
  title: string;
  description: string;
  metadata?: {
    oldValue?: string;
    newValue?: string;
    taskType?: string;
    quotationAmount?: number;
  };
}

interface ViewHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadData: {
    id: string;
    name: string;
  };
}

// Mock history data
const historyEvents: HistoryEvent[] = [
  {
    id: '1',
    timestamp: '2023-05-25T14:30:00Z',
    type: 'follow_up',
    user: 'Vijay Kumar',
    title: 'Follow-up Call Completed',
    description: 'Customer interested in granite countertops. Requested site visit for measurement.',
    metadata: { taskType: 'Call' }
  },
  {
    id: '2',
    timestamp: '2023-05-20T10:15:00Z',
    type: 'task_completed',
    user: 'Ankit Sharma',
    title: 'Site Visit Completed',
    description: 'Visited customer location. Measurements taken. Customer wants premium granite with polished finish.',
    metadata: { taskType: 'Site Visit' }
  },
  {
    id: '3',
    timestamp: '2023-05-18T16:45:00Z',
    type: 'status_change',
    user: 'Admin',
    title: 'Status Updated',
    description: 'Lead status changed from New to In Progress',
    metadata: { oldValue: 'New', newValue: 'In Progress' }
  },
  {
    id: '4',
    timestamp: '2023-05-15T09:00:00Z',
    type: 'created',
    user: 'System',
    title: 'Lead Created',
    description: 'New lead created from website form submission. Auto-assigned to Vijay Kumar.',
    metadata: {}
  }
];

const getEventIcon = (type: string) => {
  switch (type) {
    case 'created':
      return <User className="h-4 w-4 text-blue-500" />;
    case 'status_change':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'follow_up':
      return <Phone className="h-4 w-4 text-orange-500" />;
    case 'task_completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'quotation':
      return <FileText className="h-4 w-4 text-purple-500" />;
    case 'note_added':
      return <Edit className="h-4 w-4 text-gray-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
};

const getEventColor = (type: string) => {
  switch (type) {
    case 'created':
      return 'bg-blue-50 border-blue-200';
    case 'status_change':
      return 'bg-green-50 border-green-200';
    case 'follow_up':
      return 'bg-orange-50 border-orange-200';
    case 'task_completed':
      return 'bg-green-50 border-green-200';
    case 'quotation':
      return 'bg-purple-50 border-purple-200';
    case 'note_added':
      return 'bg-gray-50 border-gray-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
};

export function ViewHistoryDialog({ open, onOpenChange, leadData }: ViewHistoryDialogProps) {
  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-IN', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      })
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead History - {leadData.name}</DialogTitle>
          <DialogDescription>
            Complete timeline of all activities and changes for this lead
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="space-y-4">
            {historyEvents.map((event, index) => {
              const { date, time } = formatDateTime(event.timestamp);
              const isLast = index === historyEvents.length - 1;
              
              return (
                <div key={event.id} className="relative">
                  {/* Timeline line */}
                  {!isLast && (
                    <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200"></div>
                  )}
                  
                  <div className={`relative flex gap-4 p-4 rounded-lg border ${getEventColor(event.type)}`}>
                    {/* Icon */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white border-2 border-current flex items-center justify-center">
                      {getEventIcon(event.type)}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {date}, {time}
                            </span>
                          </div>
                          
                          <h4 className="font-medium text-sm mb-1">{event.title}</h4>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{event.user}</span>
                            
                            {event.metadata?.taskType && (
                              <Badge variant="outline" className="text-xs">
                                {event.metadata.taskType}
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700">{event.description}</p>
                          
                          {/* Status change details */}
                          {event.type === 'status_change' && event.metadata && (
                            <div className="mt-2 flex items-center gap-2 text-xs">
                              <Badge variant="outline">{event.metadata.oldValue}</Badge>
                              <span>→</span>
                              <Badge variant="default">{event.metadata.newValue}</Badge>
                            </div>
                          )}
                          
                          {/* Quotation details */}
                          {event.type === 'quotation' && event.metadata?.quotationAmount && (
                            <div className="mt-2">
                              <Badge variant="secondary">
                                ₹{event.metadata.quotationAmount.toLocaleString('en-IN')}
                              </Badge>
                            </div>
                          )}
                        </div>
                        
                        {/* Admin actions */}
                        <div className="flex gap-1 ml-4">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Add manual entry button (Admin only) */}
          <div className="mt-6 pt-4 border-t">
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Add Manual Entry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
