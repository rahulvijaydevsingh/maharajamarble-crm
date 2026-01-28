import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useAutomationExecutions } from "@/hooks/useAutomationRules";
import { EXECUTION_STATUS_COLORS } from "@/constants/automationConstants";

interface AutomationExecutionLogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
}

export const AutomationExecutionLog = ({ open, onOpenChange, ruleId }: AutomationExecutionLogProps) => {
  const { data: executions, isLoading } = useAutomationExecutions(ruleId);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-600" />;
      case "partial_success": return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default: return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Execution History</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !executions?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              No executions yet
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {executions.map(exec => (
                <div key={exec.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(exec.status)}
                      <Badge variant="outline" className={EXECUTION_STATUS_COLORS[exec.status]?.bg}>
                        {exec.status.replace("_", " ")}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {exec.actions_succeeded}/{exec.actions_attempted} actions
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(exec.trigger_timestamp), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  
                  {exec.execution_log?.length > 0 && (
                    <div className="pl-4 border-l-2 space-y-1">
                      {exec.execution_log.map((log: any, idx: number) => (
                        <div key={idx} className="text-sm flex items-start gap-2">
                          {log.status === "success" ? (
                            <CheckCircle className="h-3 w-3 mt-1 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 mt-1 text-red-600" />
                          )}
                          <span>{log.details || `Action ${log.action_index + 1}: ${log.action_type}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {exec.error_details && (
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      {exec.error_details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
