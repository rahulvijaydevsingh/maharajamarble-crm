
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Edit, MoreHorizontal, Phone } from "lucide-react";

interface LeadStatus {
  label: string;
  value: 'new' | 'in-progress' | 'quoted' | 'won' | 'lost';
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  interest: string;
  status: LeadStatus;
  assignedTo: string;
  lastContact: string;
  nextFollowUp: string;
}

const statuses: Record<string, { label: string; className: string }> = {
  'new': { label: 'New', className: 'bg-blue-50 text-blue-600 hover:bg-blue-50' },
  'in-progress': { label: 'In Progress', className: 'bg-yellow-50 text-yellow-600 hover:bg-yellow-50' },
  'quoted': { label: 'Quoted', className: 'bg-purple-50 text-purple-600 hover:bg-purple-50' },
  'won': { label: 'Won', className: 'bg-green-50 text-green-600 hover:bg-green-50' },
  'lost': { label: 'Lost', className: 'bg-red-50 text-red-600 hover:bg-red-50' }
};

const dummyLeads: Lead[] = [
  {
    id: '1',
    name: 'Rahul Sharma',
    phone: '+91 98765 43210',
    source: 'Website',
    interest: 'Marble Flooring',
    status: { label: 'New', value: 'new' },
    assignedTo: 'Vijay',
    lastContact: '2023-05-20',
    nextFollowUp: '2023-05-25',
  },
  {
    id: '2',
    name: 'Priya Patel',
    phone: '+91 87654 32109',
    source: 'Referral',
    interest: 'Kitchen Countertops',
    status: { label: 'In Progress', value: 'in-progress' },
    assignedTo: 'Ankit',
    lastContact: '2023-05-19',
    nextFollowUp: '2023-05-24',
  },
  {
    id: '3',
    name: 'Amit Singh',
    phone: '+91 76543 21098',
    source: 'Exhibition',
    interest: 'Granite Stairs',
    status: { label: 'Quoted', value: 'quoted' },
    assignedTo: 'Sanjay',
    lastContact: '2023-05-18',
    nextFollowUp: '2023-05-27',
  },
  {
    id: '4',
    name: 'Sunita Verma',
    phone: '+91 65432 10987',
    source: 'Walk-in',
    interest: 'Bathroom Vanity',
    status: { label: 'Won', value: 'won' },
    assignedTo: 'Meera',
    lastContact: '2023-05-15',
    nextFollowUp: '2023-06-15',
  },
  {
    id: '5',
    name: 'Raj Malhotra',
    phone: '+91 54321 09876',
    source: 'Google',
    interest: 'Office Flooring',
    status: { label: 'Lost', value: 'lost' },
    assignedTo: 'Vijay',
    lastContact: '2023-05-10',
    nextFollowUp: '-',
  },
];

export function LeadTable() {
  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Interest</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Next Follow Up</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dummyLeads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name}</TableCell>
              <TableCell>
                <div className="flex items-center">
                  <Phone className="h-3 w-3 mr-1" />
                  {lead.phone}
                </div>
              </TableCell>
              <TableCell>{lead.source}</TableCell>
              <TableCell>{lead.interest}</TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={statuses[lead.status.value]?.className}
                >
                  {lead.status.label}
                </Badge>
              </TableCell>
              <TableCell>{lead.assignedTo}</TableCell>
              <TableCell>{lead.nextFollowUp}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem>Add Follow Up</DropdownMenuItem>
                    <DropdownMenuItem>View History</DropdownMenuItem>
                    <DropdownMenuItem>Create Task</DropdownMenuItem>
                    <DropdownMenuItem>Create Quotation</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
