import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, ChevronDown, ChevronRight, BookOpen, Zap, Key } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const BASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api`;

interface Endpoint {
  method: string;
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  bodyFields?: { name: string; type: string; required: boolean; description: string }[];
  exampleResponse: string;
}

const methodColor: Record<string, string> = {
  GET: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PUT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PATCH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const endpoints: Record<string, Endpoint[]> = {
  Leads: [
    { method: "GET", path: "/v1/leads", description: "List all leads (paginated)", params: [
      { name: "status", type: "string", required: false, description: "Filter by status" },
      { name: "assigned_to", type: "string", required: false, description: "Filter by assignee" },
      { name: "search", type: "string", required: false, description: "Search name/phone/email" },
      { name: "page", type: "number", required: false, description: "Page number (default: 1)" },
      { name: "per_page", type: "number", required: false, description: "Results per page (default: 50)" },
    ], exampleResponse: '{"success":true,"data":[{"id":"...","name":"Raj","phone":"98765"}],"meta":{"total":42,"page":1,"per_page":50}}' },
    { method: "GET", path: "/v1/leads/:id", description: "Get a single lead", exampleResponse: '{"success":true,"data":{"id":"...","name":"Raj","status":"new"}}' },
    { method: "POST", path: "/v1/leads", description: "Create a new lead", bodyFields: [
      { name: "name", type: "string", required: true, description: "Lead name" },
      { name: "phone", type: "string", required: true, description: "Phone number" },
      { name: "email", type: "string", required: false, description: "Email address" },
      { name: "status", type: "string", required: false, description: "new, in-progress, quoted, won, lost" },
      { name: "assigned_to", type: "string", required: false, description: "Staff member name" },
      { name: "notes", type: "string", required: false, description: "Notes" },
    ], exampleResponse: '{"success":true,"data":{"id":"...","name":"Raj","status":"new"}}' },
    { method: "PUT", path: "/v1/leads/:id", description: "Update a lead", exampleResponse: '{"success":true,"data":{"id":"...","name":"Updated"}}' },
    { method: "DELETE", path: "/v1/leads/:id", description: "Delete a lead", exampleResponse: '{"success":true,"message":"Lead deleted"}' },
    { method: "PATCH", path: "/v1/leads/:id/status", description: "Update lead status", bodyFields: [
      { name: "status", type: "string", required: true, description: "new, in-progress, quoted, won, lost" },
    ], exampleResponse: '{"success":true,"data":{"id":"...","status":"won"}}' },
  ],
  Tasks: [
    { method: "GET", path: "/v1/tasks", description: "List tasks", params: [
      { name: "status", type: "string", required: false, description: "Filter by status" },
      { name: "lead_id", type: "uuid", required: false, description: "Filter by lead" },
    ], exampleResponse: '{"success":true,"data":[...],"meta":{"total":10}}' },
    { method: "POST", path: "/v1/tasks", description: "Create a task", bodyFields: [
      { name: "title", type: "string", required: true, description: "Task title" },
      { name: "lead_id", type: "uuid", required: false, description: "Related lead" },
      { name: "due_date", type: "datetime", required: false, description: "Due date" },
    ], exampleResponse: '{"success":true,"data":{"id":"...","title":"Follow up"}}' },
    { method: "PATCH", path: "/v1/tasks/:id/complete", description: "Mark task as completed", exampleResponse: '{"success":true,"data":{"status":"completed"}}' },
  ],
  Reminders: [
    { method: "GET", path: "/v1/reminders", description: "List reminders", exampleResponse: '{"success":true,"data":[...]}' },
    { method: "POST", path: "/v1/reminders", description: "Create a reminder", bodyFields: [
      { name: "title", type: "string", required: true, description: "Reminder title" },
      { name: "reminder_datetime", type: "datetime", required: true, description: "When to remind" },
      { name: "lead_id", type: "uuid", required: false, description: "Related lead" },
    ], exampleResponse: '{"success":true,"data":{"id":"..."}}' },
  ],
  Quotations: [
    { method: "GET", path: "/v1/quotations", description: "List quotations", exampleResponse: '{"success":true,"data":[...]}' },
    { method: "POST", path: "/v1/quotations", description: "Create a quotation", bodyFields: [
      { name: "client_name", type: "string", required: true, description: "Client name" },
      { name: "items", type: "array", required: false, description: "Line items" },
    ], exampleResponse: '{"success":true,"data":{"id":"...","quotation_number":"QT-..."}}' },
  ],
  "Activity Log": [
    { method: "GET", path: "/v1/activity", description: "List activity entries", exampleResponse: '{"success":true,"data":[...]}' },
    { method: "POST", path: "/v1/activity", description: "Create activity entry", bodyFields: [
      { name: "title", type: "string", required: true, description: "Activity title" },
      { name: "activity_type", type: "string", required: true, description: "Type: call, meeting, note, etc." },
    ], exampleResponse: '{"success":true,"data":{"id":"..."}}' },
  ],
  Utility: [
    { method: "GET", path: "/v1/staff", description: "List active staff members", exampleResponse: '{"success":true,"data":[{"full_name":"Admin","email":"..."}]}' },
    { method: "GET", path: "/v1/search?q=term", description: "Search leads by name/phone/email", exampleResponse: '{"success":true,"data":[...]}' },
    { method: "GET", path: "/v1/stats", description: "Dashboard summary stats", exampleResponse: '{"success":true,"data":{"total_leads":42,"pending_tasks":5}}' },
  ],
};

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const curlExample = ep.method === "GET"
    ? `curl -H "Authorization: Bearer YOUR_KEY" \\\n  ${BASE_URL}${ep.path}`
    : `curl -X ${ep.method} \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${ep.bodyFields ? JSON.stringify(Object.fromEntries(ep.bodyFields.filter(f => f.required).map(f => [f.name, f.type === "string" ? "value" : "..."]))) : '{}'}' \\\n  ${BASE_URL}${ep.path}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg">
      <CollapsibleTrigger className="flex items-center gap-3 w-full p-3 hover:bg-muted/50 transition-colors">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Badge className={`${methodColor[ep.method]} font-mono text-xs px-2`} variant="outline">
          {ep.method}
        </Badge>
        <code className="text-sm font-mono">{ep.path}</code>
        <span className="text-sm text-muted-foreground ml-auto hidden sm:inline">{ep.description}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-4 space-y-4">
        <p className="text-sm">{ep.description}</p>

        {ep.params && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Query Parameters</h4>
            <div className="border rounded overflow-hidden text-sm">
              <table className="w-full">
                <thead><tr className="bg-muted"><th className="p-2 text-left">Name</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Required</th><th className="p-2 text-left">Description</th></tr></thead>
                <tbody>
                  {ep.params.map(p => (
                    <tr key={p.name} className="border-t"><td className="p-2 font-mono">{p.name}</td><td className="p-2">{p.type}</td><td className="p-2">{p.required ? "Yes" : "No"}</td><td className="p-2">{p.description}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {ep.bodyFields && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Request Body</h4>
            <div className="border rounded overflow-hidden text-sm">
              <table className="w-full">
                <thead><tr className="bg-muted"><th className="p-2 text-left">Field</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Required</th><th className="p-2 text-left">Description</th></tr></thead>
                <tbody>
                  {ep.bodyFields.map(f => (
                    <tr key={f.name} className="border-t"><td className="p-2 font-mono">{f.name}</td><td className="p-2">{f.type}</td><td className="p-2">{f.required ? "Yes" : "No"}</td><td className="p-2">{f.description}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold">Example cURL</h4>
            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(curlExample); toast({ title: "Copied" }); }}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
          </div>
          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto font-mono whitespace-pre-wrap">{curlExample}</pre>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-1">Example Response</h4>
          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto font-mono">{JSON.stringify(JSON.parse(ep.exampleResponse), null, 2)}</pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ApiDocs() {
  const { toast } = useToast();

  const quickStart = `You are a CRM assistant for Maharaja Marble.
API Base URL: ${BASE_URL}
API Key: YOUR_KEY_HERE

Available actions: manage leads, tasks, reminders, quotations, and activity logs via REST API.
When I give you instructions, call the appropriate API endpoint.
Always confirm actions before destructive operations like delete.`;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 max-w-5xl">
        <div>
          <h1 className="text-3xl font-bold text-marble-primary mb-1 flex items-center gap-2">
            <BookOpen className="h-7 w-7" />
            API Documentation
          </h1>
          <p className="text-muted-foreground">
            Complete REST API reference for external AI tool integration
          </p>
        </div>

        {/* Quick Start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Start — Paste into Claude / ChatGPT / Grok
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="bg-muted p-4 rounded text-sm font-mono whitespace-pre-wrap">{quickStart}</pre>
            <Button onClick={() => { navigator.clipboard.writeText(quickStart); toast({ title: "Copied to clipboard" }); }}>
              <Copy className="h-4 w-4 mr-2" /> Copy Quick Start
            </Button>
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>All requests require a Bearer token in the Authorization header:</p>
            <pre className="bg-muted p-3 rounded font-mono">Authorization: Bearer mmcrm_YOUR_KEY_HERE</pre>
            <p>Generate API keys in <a href="/settings" className="text-primary underline">Settings → API Access</a>.</p>
            <p className="text-muted-foreground">Rate limit: 200 requests per hour per key. Headers <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code> are included on every response.</p>
          </CardContent>
        </Card>

        {/* Natural Language Examples */}
        <Card>
          <CardHeader><CardTitle>Natural Language → API Mapping</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm font-mono">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">"Create a lead for Raj at 9876543210"</span>
                <span>→ POST /v1/leads {`{"name":"Raj","phone":"9876543210"}`}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">"Show all new leads assigned to Priya"</span>
                <span>→ GET /v1/leads?status=new&assigned_to=Priya</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-b pb-2">
                <span className="text-muted-foreground">"Mark task abc123 as done"</span>
                <span>→ PATCH /v1/tasks/abc123/complete</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <span className="text-muted-foreground">"Give me a CRM summary"</span>
                <span>→ GET /v1/stats</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Endpoints */}
        {Object.entries(endpoints).map(([section, eps]) => (
          <Card key={section}>
            <CardHeader><CardTitle>{section}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {eps.map((ep, i) => (
                <EndpointCard key={i} ep={ep} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
