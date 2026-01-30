
import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Calendar, 
  Clock, 
  MoreHorizontal, 
  Search, 
  User,
  Phone,
  CheckCircle,
  Edit,
  Trash2
} from "lucide-react";
import { PhoneLink } from "@/components/shared/PhoneLink";

// Task interface
interface Task {
  id: string;
  title: string;
  type: string;
  priority: 'High' | 'Medium' | 'Low';
  assignedTo: string;
  relatedTo?: {
    id: string;
    name: string;
    phone: string;
    type: 'Lead' | 'Customer' | 'Professional';
  };
  dueDate: string;
  dueTime?: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
  description?: string;
  reminder?: boolean;
  createdBy: string;
  createdAt: string;
}

// Sample tasks data
const sampleTasks: Task[] = [
  {
    id: 'T001',
    title: 'Follow-up call with Rahul Sharma',
    type: 'Follow-up Call',
    priority: 'High',
    assignedTo: 'Vijay Kumar',
    relatedTo: {
      id: 'L001',
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      type: 'Lead'
    },
    dueDate: '2024-01-25',
    dueTime: '10:00 AM',
    status: 'Pending',
    description: 'Follow up on kitchen marble requirements',
    reminder: true,
    createdBy: 'Admin',
    createdAt: '2024-01-20'
  },
  {
    id: 'T002',
    title: 'Site visit for measurement',
    type: 'Site Visit',
    priority: 'Medium',
    assignedTo: 'Sanjay Patel',
    relatedTo: {
      id: 'C001',
      name: 'Priya Patel',
      phone: '+91 87654 32109',
      type: 'Customer'
    },
    dueDate: '2024-01-26',
    dueTime: '2:00 PM',
    status: 'In Progress',
    description: 'Take measurements for bathroom renovation',
    reminder: false,
    createdBy: 'Manager',
    createdAt: '2024-01-21'
  },
  {
    id: 'T003',
    title: 'Deliver marble samples',
    type: 'Sample Delivery',
    priority: 'Low',
    assignedTo: 'Ankit Singh',
    relatedTo: {
      id: 'L002',
      name: 'Amit Verma',
      phone: '+91 76543 21098',
      type: 'Lead'
    },
    dueDate: '2024-01-24',
    status: 'Overdue',
    description: 'Deliver Italian marble samples',
    reminder: true,
    createdBy: 'Sales',
    createdAt: '2024-01-19'
  }
];

// Priority styles
const priorityStyles = {
  High: { className: "bg-red-50 text-red-600 hover:bg-red-50", label: "High" },
  Medium: { className: "bg-yellow-50 text-yellow-600 hover:bg-yellow-50", label: "Medium" },
  Low: { className: "bg-green-50 text-green-600 hover:bg-green-50", label: "Low" },
};

// Status styles
const statusStyles = {
  Pending: { className: "bg-blue-50 text-blue-600 hover:bg-blue-50", label: "Pending" },
  'In Progress': { className: "bg-orange-50 text-orange-600 hover:bg-orange-50", label: "In Progress" },
  Completed: { className: "bg-green-50 text-green-600 hover:bg-green-50", label: "Completed" },
  Overdue: { className: "bg-red-50 text-red-600 hover:bg-red-50", label: "Overdue" },
};

interface TaskTableProps {
  onEditTask?: (task: Task) => void;
}

export function TaskTable({ onEditTask }: TaskTableProps) {
  const [tasks, setTasks] = useState<Task[]>(sampleTasks);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.relatedTo?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const handleCompleteTask = (taskId: string) => {
    setTasks(tasks.map(task => 
      task.id === taskId 
        ? { ...task, status: 'Completed' as const }
        : task
    ));
  };

  const handleDeleteTask = (taskId: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      setTasks(tasks.filter(task => task.id !== taskId));
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tasks by title, assignee, or related contact..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Related To</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{task.title}</div>
                    {task.description && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {task.description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{task.type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="secondary" 
                    className={priorityStyles[task.priority].className}
                  >
                    {task.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span className="text-sm">{task.assignedTo}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {task.relatedTo ? (
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{task.relatedTo.name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <PhoneLink phone={task.relatedTo.phone} className="text-xs" />
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {task.relatedTo.type}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3" />
                      {task.dueDate}
                    </div>
                    {task.dueTime && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {task.dueTime}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="secondary" 
                    className={statusStyles[task.status].className}
                  >
                    {task.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {task.status !== 'Completed' && (
                        <DropdownMenuItem 
                          onClick={() => handleCompleteTask(task.id)}
                          className="text-green-600"
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Mark Complete
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onEditTask?.(task)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Task
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredTasks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No tasks found matching your filters.
        </div>
      )}
    </div>
  );
}
