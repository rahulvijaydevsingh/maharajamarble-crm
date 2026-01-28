
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult
} from "react-beautiful-dnd";
import { GripVertical, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ActionSetting {
  id: string;
  name: string;
  enabled: boolean;
  permissions: {
    admin: boolean;
    manager: boolean;
    sales: boolean;
  };
  visibilityRules: {
    status: string[];
    assignedToSelf: boolean;
  };
}

export function ActionSettingsPanel() {
  const [actions, setActions] = useState<ActionSetting[]>([
    {
      id: "edit-details",
      name: "Edit Details",
      enabled: true,
      permissions: {
        admin: true,
        manager: true,
        sales: true
      },
      visibilityRules: {
        status: ["new", "in-progress", "quoted"],
        assignedToSelf: true
      }
    },
    {
      id: "add-follow-up",
      name: "Add Follow-up",
      enabled: true,
      permissions: {
        admin: true,
        manager: true,
        sales: true
      },
      visibilityRules: {
        status: ["new", "in-progress", "quoted"],
        assignedToSelf: false
      }
    },
    {
      id: "view-history",
      name: "View History",
      enabled: true,
      permissions: {
        admin: true,
        manager: true,
        sales: true
      },
      visibilityRules: {
        status: ["new", "in-progress", "quoted", "won", "lost"],
        assignedToSelf: false
      }
    },
    {
      id: "create-quotation",
      name: "Create Quotation",
      enabled: true,
      permissions: {
        admin: true,
        manager: true,
        sales: true
      },
      visibilityRules: {
        status: ["new", "in-progress"],
        assignedToSelf: false
      }
    },
    {
      id: "add-to-customer",
      name: "Add to Customer Database",
      enabled: true,
      permissions: {
        admin: true,
        manager: true,
        sales: false
      },
      visibilityRules: {
        status: ["new", "in-progress", "quoted"],
        assignedToSelf: false
      }
    }
  ]);
  
  const [newActionName, setNewActionName] = useState("");
  const { toast } = useToast();

  const handleOnDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(actions);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setActions(items);
  };

  const toggleActionState = (id: string, enabled: boolean) => {
    setActions(
      actions.map(action => 
        action.id === id ? { ...action, enabled } : action
      )
    );
  };

  const togglePermission = (id: string, role: 'admin' | 'manager' | 'sales', value: boolean) => {
    setActions(
      actions.map(action => 
        action.id === id 
          ? { 
              ...action, 
              permissions: { 
                ...action.permissions, 
                [role]: value 
              } 
            } 
          : action
      )
    );
  };

  const toggleStatusVisibility = (id: string, status: string) => {
    setActions(
      actions.map(action => {
        if (action.id !== id) return action;
        
        const currentStatuses = action.visibilityRules.status;
        const newStatuses = currentStatuses.includes(status)
          ? currentStatuses.filter(s => s !== status)
          : [...currentStatuses, status];
          
        return {
          ...action,
          visibilityRules: {
            ...action.visibilityRules,
            status: newStatuses
          }
        };
      })
    );
  };

  const toggleAssignedToSelfRule = (id: string, value: boolean) => {
    setActions(
      actions.map(action => 
        action.id === id 
          ? { 
              ...action, 
              visibilityRules: { 
                ...action.visibilityRules, 
                assignedToSelf: value 
              } 
            } 
          : action
      )
    );
  };

  const addNewAction = () => {
    if (!newActionName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the new action",
        variant: "destructive",
      });
      return;
    }
    
    const newAction: ActionSetting = {
      id: `custom-${Date.now()}`,
      name: newActionName,
      enabled: true,
      permissions: {
        admin: true,
        manager: false,
        sales: false
      },
      visibilityRules: {
        status: ["new", "in-progress"],
        assignedToSelf: false
      }
    };
    
    setActions([...actions, newAction]);
    setNewActionName("");
    
    toast({
      title: "Action Created",
      description: `New action "${newActionName}" has been added successfully.`,
    });
  };

  const deleteAction = (id: string) => {
    setActions(actions.filter(action => action.id !== id));
    
    toast({
      title: "Action Deleted",
      description: "The action has been removed.",
    });
  };

  const saveSettings = () => {
    console.log("Saving actions configuration:", actions);
    
    toast({
      title: "Settings Saved",
      description: "Action menu settings have been saved successfully.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h3 className="text-lg font-medium">Lead Actions Configuration</h3>
          <p className="text-muted-foreground">
            Configure which actions are available and who can access them
          </p>
        </div>
        <Button onClick={saveSettings}>Save Changes</Button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-6 text-sm font-medium px-4">
          <div className="col-span-2">Action Name</div>
          <div className="col-span-1">Enabled</div>
          <div className="col-span-2">Permissions</div>
          <div className="col-span-1">Rules</div>
        </div>

        <DragDropContext onDragEnd={handleOnDragEnd}>
          <Droppable droppableId="actions">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-2"
              >
                {actions.map((action, index) => (
                  <Draggable key={action.id} draggableId={action.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="bg-white rounded-md border"
                      >
                        {/* Action row header */}
                        <div className="grid grid-cols-6 items-center p-4">
                          <div className="col-span-2 flex items-center gap-2">
                            <div {...provided.dragHandleProps} className="cursor-grab">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <span>{action.name}</span>
                          </div>
                          
                          <div className="col-span-1 flex items-center">
                            <Checkbox
                              checked={action.enabled}
                              onCheckedChange={(checked) => 
                                toggleActionState(action.id, checked === true)
                              }
                            />
                          </div>
                          
                          <div className="col-span-2 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`admin-${action.id}`}
                                checked={action.permissions.admin}
                                onCheckedChange={(checked) => 
                                  togglePermission(action.id, 'admin', checked === true)
                                }
                              />
                              <Label htmlFor={`admin-${action.id}`} className="text-xs">Admin</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`manager-${action.id}`}
                                checked={action.permissions.manager}
                                onCheckedChange={(checked) => 
                                  togglePermission(action.id, 'manager', checked === true)
                                }
                              />
                              <Label htmlFor={`manager-${action.id}`} className="text-xs">Manager</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`sales-${action.id}`}
                                checked={action.permissions.sales}
                                onCheckedChange={(checked) => 
                                  togglePermission(action.id, 'sales', checked === true)
                                }
                              />
                              <Label htmlFor={`sales-${action.id}`} className="text-xs">Sales</Label>
                            </div>
                          </div>
                          
                          <div className="col-span-1 flex justify-end">
                            <Button 
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteAction(action.id)}
                              className="h-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Visibility rules section */}
                        <div className="border-t bg-muted/50 p-4">
                          <div className="text-xs font-medium mb-2">Visibility Rules</div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs mb-2">Show for Status:</div>
                              <div className="flex flex-wrap gap-2">
                                {['new', 'in-progress', 'quoted', 'won', 'lost'].map((status) => (
                                  <div key={status} className="flex items-center gap-1">
                                    <Checkbox
                                      id={`${action.id}-status-${status}`}
                                      checked={action.visibilityRules.status.includes(status)}
                                      onCheckedChange={(checked) => 
                                        checked !== 'indeterminate' && 
                                        toggleStatusVisibility(action.id, status)
                                      }
                                    />
                                    <Label 
                                      htmlFor={`${action.id}-status-${status}`} 
                                      className="text-xs capitalize"
                                    >
                                      {status.replace(/-/g, ' ')}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`${action.id}-assigned-to-self`}
                                checked={action.visibilityRules.assignedToSelf}
                                onCheckedChange={(checked) => 
                                  toggleAssignedToSelfRule(action.id, checked === true)
                                }
                              />
                              <Label 
                                htmlFor={`${action.id}-assigned-to-self`} 
                                className="text-xs"
                              >
                                Only show for leads assigned to current user
                              </Label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-md">Add Custom Action</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Action Name"
              value={newActionName}
              onChange={(e) => setNewActionName(e.target.value)}
            />
            <Button onClick={addNewAction}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
