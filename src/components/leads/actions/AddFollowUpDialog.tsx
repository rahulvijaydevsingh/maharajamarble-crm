
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface AddFollowUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadData: {
    id: string;
    name: string;
  };
  onCreateTask: (taskData: any) => void;
}

const TASK_TYPES = [
  "Follow-up Call",
  "Meeting",
  "Sample Delivery", 
  "Site Visit",
  "Send Quotation",
  "Other"
];

const PRIORITY_LEVELS = [
  { value: 1, label: "High", color: "text-red-600" },
  { value: 2, label: "Medium", color: "text-yellow-600" },
  { value: 3, label: "Low", color: "text-blue-600" }
];

const TEAM_MEMBERS = ["Vijay", "Ankit", "Sanjay", "Meera"];

export function AddFollowUpDialog({ open, onOpenChange, leadData, onCreateTask }: AddFollowUpDialogProps) {
  const [formData, setFormData] = useState({
    taskType: "",
    priority: 2,
    dueDate: "",
    dueTime: "",
    description: "",
    assignedTo: "",
    reminderBefore: 30 // minutes
  });
  
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const taskData = {
      id: `TASK-${Date.now()}`,
      leadId: leadData.id,
      leadName: leadData.name,
      title: `${formData.taskType} - ${leadData.name}`,
      type: formData.taskType,
      priority: formData.priority,
      dueDateTime: `${formData.dueDate} ${formData.dueTime}`,
      description: formData.description,
      assignedTo: formData.assignedTo,
      reminderBefore: formData.reminderBefore,
      status: "Pending",
      createdAt: new Date().toISOString(),
    };
    
    console.log("Creating follow-up task:", taskData);
    onCreateTask(taskData);
    
    toast({
      title: "Follow-up Task Created",
      description: `Task "${formData.taskType}" has been assigned to ${formData.assignedTo}.`,
    });
    
    // Reset form
    setFormData({
      taskType: "",
      priority: 2,
      dueDate: "",
      dueTime: "",
      description: "",
      assignedTo: "",
      reminderBefore: 30
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Follow-up Task</DialogTitle>
            <DialogDescription>
              Create a follow-up task for {leadData.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="taskType">Task Type *</Label>
              <Select value={formData.taskType} onValueChange={(value) => handleSelectChange("taskType", value)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select task type" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select value={formData.priority.toString()} onValueChange={(value) => handleSelectChange("priority", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value.toString()}>
                      <span className={level.color}>{level.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date *</Label>
                <Input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueTime">Due Time *</Label>
                <Input
                  id="dueTime"
                  name="dueTime"
                  type="time"
                  value={formData.dueTime}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assign To *</Label>
              <Select value={formData.assignedTo} onValueChange={(value) => handleSelectChange("assignedTo", value)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.map((member) => (
                    <SelectItem key={member} value={member}>{member}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reminderBefore">Reminder</Label>
              <Select value={formData.reminderBefore.toString()} onValueChange={(value) => handleSelectChange("reminderBefore", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reminder time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                  <SelectItem value="1440">1 day before</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description/Notes</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Enter any additional details about this task..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
