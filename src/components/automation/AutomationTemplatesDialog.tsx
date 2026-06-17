import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Zap, Clock } from "lucide-react";
import { useAutomationTemplates, useCreateFromTemplate } from "@/hooks/useAutomationRules";
import { EntityType } from "@/types/automation";
import { ENTITY_TYPES, TRIGGER_TYPES } from "@/constants/automationConstants";

interface AutomationTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType?: EntityType;
}

export const AutomationTemplatesDialog = ({ open, onOpenChange, entityType }: AutomationTemplatesDialogProps) => {
  const { data: templates, isLoading } = useAutomationTemplates(entityType);
  const createFromTemplate = useCreateFromTemplate();

  const handleUseTemplate = (templateId: string) => {
    createFromTemplate.mutate(templateId, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Automation Templates</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !templates?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              No templates available
            </div>
          ) : (
            <div className="grid gap-4 p-4">
              {templates.map(template => (
                <Card key={template.id} className="hover:border-primary transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{template.template_name}</CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">
                          {ENTITY_TYPES.find(e => e.value === template.entity_type)?.label}
                        </Badge>
                        <Badge variant="secondary">
                          {TRIGGER_TYPES.find(t => t.value === template.trigger_type)?.label}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {template.actions?.length || 0} action(s)
                      </span>
                      <Button 
                        size="sm" 
                        onClick={() => handleUseTemplate(template.id)}
                        disabled={createFromTemplate.isPending}
                      >
                        Use Template
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
