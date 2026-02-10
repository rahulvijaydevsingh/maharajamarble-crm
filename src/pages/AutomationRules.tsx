import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Copy,
  History,
  Zap,
  Clock,
  Hash,
  Filter,
  ChevronRight,
  Loader2,
  FileText,
  Users,
  UserPlus,
  Briefcase,
  CheckSquare,
} from "lucide-react";
import { format } from "date-fns";
import { 
  useAutomationRules, 
  useToggleAutomationRule, 
  useDeleteAutomationRule,
  useDuplicateAutomationRule,
  useAutomationTemplates,
  useCreateFromTemplate,
} from "@/hooks/useAutomationRules";
import { EntityType, TriggerType, AutomationRule } from "@/types/automation";
import { ENTITY_TYPES, TRIGGER_TYPES } from "@/constants/automationConstants";
import { AddAutomationRuleDialog } from "@/components/automation/AddAutomationRuleDialog";
import { AutomationExecutionLog } from "@/components/automation/AutomationExecutionLog";
import { AutomationTemplatesDialog } from "@/components/automation/AutomationTemplatesDialog";

const entityIcons: Record<EntityType, React.ReactNode> = {
  leads: <UserPlus className="h-4 w-4" />,
  tasks: <CheckSquare className="h-4 w-4" />,
  customers: <Users className="h-4 w-4" />,
  professionals: <Briefcase className="h-4 w-4" />,
  quotations: <FileText className="h-4 w-4" />,
  kit: <Heart className="h-4 w-4" />,
};

const triggerIcons: Record<TriggerType, React.ReactNode> = {
  field_change: <Zap className="h-4 w-4" />,
  time_based: <Clock className="h-4 w-4" />,
  count_based: <Hash className="h-4 w-4" />,
  saved_filter: <Filter className="h-4 w-4" />,
};

const AutomationRules = () => {
  const { entityType } = useParams<{ entityType?: string }>();
  const navigate = useNavigate();
  const currentEntity = entityType as EntityType | undefined;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [viewingLogRuleId, setViewingLogRuleId] = useState<string | null>(null);
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  
  const { data: rules, isLoading } = useAutomationRules(currentEntity);
  const toggleRule = useToggleAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const duplicateRule = useDuplicateAutomationRule();
  
  const filteredRules = (rules || []).filter(rule => {
    const matchesSearch = rule.rule_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rule.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "active" && rule.is_active) ||
      (statusFilter === "inactive" && !rule.is_active);
    return matchesSearch && matchesStatus;
  });

  const getTriggerLabel = (triggerType: TriggerType) => {
    return TRIGGER_TYPES.find(t => t.value === triggerType)?.label || triggerType;
  };

  const getTriggerSummary = (rule: AutomationRule) => {
    const config = rule.trigger_config;
    if (rule.trigger_type === "field_change") {
      const fieldConfig = config as any;
      if (fieldConfig.when === "record_created") return "When record is created";
      if (fieldConfig.when === "record_deleted") return "When record is deleted";
      if (fieldConfig.field && fieldConfig.value !== undefined) {
        return `When ${fieldConfig.field} = "${fieldConfig.value}"`;
      }
      return "When field changes";
    }
    if (rule.trigger_type === "time_based") {
      const timeConfig = config as any;
      if (timeConfig.offset_value && timeConfig.offset_unit) {
        return `${timeConfig.offset_value} ${timeConfig.offset_unit} ${timeConfig.offset_direction || "after"} ${timeConfig.field || "creation"}`;
      }
      return "Time-based trigger";
    }
    if (rule.trigger_type === "count_based") {
      const countConfig = config as any;
      return `Count ${countConfig.threshold_operator} ${countConfig.threshold_value}`;
    }
    if (rule.trigger_type === "saved_filter") {
      const filterConfig = config as any;
      return `Filter count ${filterConfig.condition} ${filterConfig.threshold || ""}`;
    }
    return "Trigger configured";
  };

  const getActionsSummary = (rule: AutomationRule) => {
    const actions = rule.actions || [];
    if (actions.length === 0) return "No actions";
    if (actions.length === 1) {
      const action = actions[0];
      switch (action.type) {
        case "create_task": return "Create task";
        case "create_reminder": return "Create reminder";
        case "send_notification": return "Send notification";
        case "update_field": return "Update field";
        case "send_email": return "Send email";
        case "execute_webhook": return "Execute webhook";
        case "trigger_automation": return "Trigger automation";
        default: return "1 action";
      }
    }
    return `${actions.length} actions`;
  };

  const handleToggle = (rule: AutomationRule) => {
    toggleRule.mutate({ id: rule.id, is_active: !rule.is_active });
  };

  const handleDelete = () => {
    if (deleteRuleId) {
      deleteRule.mutate(deleteRuleId);
      setDeleteRuleId(null);
    }
  };

  const handleDuplicate = (ruleId: string) => {
    duplicateRule.mutate(ruleId);
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setAddDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workflow Automation</h1>
            <p className="text-muted-foreground">
              Create IF-THEN automation rules to automate your CRM processes
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTemplatesDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </Button>
            <Button onClick={() => { setEditingRule(null); setAddDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </div>

        {/* Entity Tabs */}
        <Tabs 
          value={currentEntity || "all"} 
          onValueChange={(value) => {
            if (value === "all") {
              navigate("/automation");
            } else {
              navigate(`/automation/${value}`);
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All Entities</TabsTrigger>
            {ENTITY_TYPES.map(entity => (
              <TabsTrigger key={entity.value} value={entity.value}>
                <span className="flex items-center gap-2">
                  {entityIcons[entity.value]}
                  {entity.label}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={currentEntity || "all"} className="mt-4">
            {/* Search and Filters */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search rules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={statusFilter === "all" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                >
                  All
                </Button>
                <Button 
                  variant={statusFilter === "active" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("active")}
                >
                  Active Only
                </Button>
                <Button 
                  variant={statusFilter === "inactive" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setStatusFilter("inactive")}
                >
                  Inactive Only
                </Button>
              </div>
            </div>

            {/* Rules Table */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRules.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No automation rules yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create your first automation rule to streamline your workflow
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setTemplatesDialogOpen(true)}>
                      Browse Templates
                    </Button>
                    <Button onClick={() => { setEditingRule(null); setAddDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Rule
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Rule Name</TableHead>
                      {!currentEntity && <TableHead>Entity</TableHead>}
                      <TableHead>When (Trigger)</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Last Triggered</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.map((rule) => (
                      <TableRow key={rule.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          {triggerIcons[rule.trigger_type]}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{rule.rule_name}</div>
                            {rule.description && (
                              <div className="text-sm text-muted-foreground truncate max-w-xs">
                                {rule.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        {!currentEntity && (
                          <TableCell>
                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                              {entityIcons[rule.entity_type]}
                              {ENTITY_TYPES.find(e => e.value === rule.entity_type)?.label}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {getTriggerLabel(rule.trigger_type)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {getTriggerSummary(rule)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{getActionsSummary(rule)}</span>
                        </TableCell>
                        <TableCell>
                          {rule.last_triggered ? (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(rule.last_triggered), "MMM d, h:mm a")}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={() => handleToggle(rule)}
                          />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(rule)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(rule.id)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setViewingLogRuleId(rule.id)}>
                                <History className="h-4 w-4 mr-2" />
                                View Log
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => setDeleteRuleId(rule.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Add/Edit Rule Dialog */}
        <AddAutomationRuleDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          editingRule={editingRule}
          defaultEntityType={currentEntity}
        />

        {/* Templates Dialog */}
        <AutomationTemplatesDialog
          open={templatesDialogOpen}
          onOpenChange={setTemplatesDialogOpen}
          entityType={currentEntity}
        />

        {/* Execution Log Dialog */}
        {viewingLogRuleId && (
          <AutomationExecutionLog
            open={!!viewingLogRuleId}
            onOpenChange={() => setViewingLogRuleId(null)}
            ruleId={viewingLogRuleId}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Automation Rule</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this automation rule? This action cannot be undone.
                All execution history for this rule will also be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default AutomationRules;
