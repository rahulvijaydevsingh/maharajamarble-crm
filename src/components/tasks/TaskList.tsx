
import { Calendar, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

interface Task {
  id: string;
  title: string;
  dueDate: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'completed';
  assignedTo: string;
}

const priorities = {
  high: { label: 'High', className: 'bg-red-50 text-red-600 hover:bg-red-50' },
  medium: { label: 'Medium', className: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-50' },
  low: { label: 'Low', className: 'bg-green-50 text-green-600 hover:bg-green-50' },
};

const tasks: Task[] = [
  {
    id: '1',
    title: 'Follow up with Rahul Sharma',
    dueDate: '2023-05-25',
    type: 'Call',
    priority: 'high',
    status: 'pending',
    assignedTo: 'Vijay',
  },
  {
    id: '2',
    title: 'Send quotation to Priya Patel',
    dueDate: '2023-05-24',
    type: 'Quotation',
    priority: 'medium',
    status: 'pending',
    assignedTo: 'Ankit',
  },
  {
    id: '3',
    title: 'Site visit at Amit Singh\'s project',
    dueDate: '2023-05-27',
    type: 'Visit',
    priority: 'high',
    status: 'pending',
    assignedTo: 'Sanjay',
  },
  {
    id: '4',
    title: 'Collect feedback from Sunita Verma',
    dueDate: '2023-06-15',
    type: 'Feedback',
    priority: 'low',
    status: 'pending',
    assignedTo: 'Meera',
  },
  {
    id: '5',
    title: 'Deliver sample to new office project',
    dueDate: '2023-05-23',
    type: 'Delivery',
    priority: 'medium',
    status: 'completed',
    assignedTo: 'Vijay',
  },
];

export function TaskList() {
  const pendingTasks = tasks.filter(task => task.status === 'pending');
  
  return (
    <Card className="marble-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium flex items-center">
          <Check className="mr-2 h-5 w-5 text-marble-accent" />
          Upcoming Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pendingTasks.map((task) => (
            <div key={task.id} className="flex items-start space-x-4 p-2 rounded-md hover:bg-gray-50">
              <Checkbox id={`task-${task.id}`} className="mt-0.5" />
              <div className="space-y-1 flex-1">
                <label
                  htmlFor={`task-${task.id}`}
                  className="font-medium cursor-pointer"
                >
                  {task.title}
                </label>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge
                    variant="secondary"
                    className={priorities[task.priority].className}
                  >
                    {priorities[task.priority].label}
                  </Badge>
                  <span className="text-xs flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {task.dueDate}
                  </span>
                  <span className="text-xs">
                    Type: {task.type}
                  </span>
                  <span className="text-xs">
                    Assigned: {task.assignedTo}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
