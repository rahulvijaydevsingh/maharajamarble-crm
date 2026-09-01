import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LeadBriefProfessional } from "@/components/tasks/LeadBriefPeopleStrip";
import type { LeadBriefTrailEntry } from "@/components/tasks/LeadBriefConversationTrail";
import { resolveProfessionalById } from "@/lib/professionalResolver";

interface LeadBriefLead {
  id: string; name: string; status: string | null; phone: string | null; alternate_phone: string | null;
  firm_name: string | null; additional_contacts: unknown; deleted_at?: string | null;
  site_location: string | null; site_plus_code: string | null; construction_stage: string | null;
  estimated_quantity: number | null; material_interests: string[] | null;
}

export function useLeadBrief({ leadId, taskId }: { leadId?: string | null; taskId?: string | null }, enabled = true) {
  const [lead, setLead] = useState<LeadBriefLead | null>(null);
  const [professionals, setProfessionals] = useState<LeadBriefProfessional[]>([]);
  const [trail, setTrail] = useState<LeadBriefTrailEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || (!leadId && !taskId)) { setLead(null); setProfessionals([]); setTrail([]); return; }
    setLoading(true);
    try {
      let resolvedLeadId = leadId || null;
      let resolvedProfessionalId: string | null = null;

      if (!resolvedLeadId && taskId) {
        const { data: taskContext, error } = await supabase.from("tasks").select("lead_id,related_entity_type,related_entity_id").eq("id", taskId).maybeSingle();
        if (error) throw error;
        resolvedLeadId = taskContext?.lead_id || (taskContext?.related_entity_type === "lead" ? taskContext.related_entity_id : null);
        if (taskContext?.related_entity_type === "professional") resolvedProfessionalId = taskContext.related_entity_id;
      }

      let directProfessional = null as Awaited<ReturnType<typeof resolveProfessionalById>>;
      if (resolvedProfessionalId) {
        directProfessional = await resolveProfessionalById(resolvedProfessionalId);
        if (!resolvedLeadId) {
          const { data: linkedLeads, error } = await supabase
            .from("lead_professionals")
            .select("lead_id,is_primary_contact")
            .eq("professional_id", resolvedProfessionalId)
            .order("is_primary_contact", { ascending: false })
            .limit(1);
          if (error) throw error;
          resolvedLeadId = linkedLeads?.[0]?.lead_id || null;
        }
      }

      if (!resolvedLeadId) {
        setLead(null);
        setProfessionals(directProfessional ? [{ id: directProfessional.id, name: directProfessional.name, phone: directProfessional.phone, designation: directProfessional.professional_type }] : []);
        setTrail([]);
        return;
      }

      const [leadResult, profResult, taskResult, legacyTaskResult] = await Promise.all([
        supabase.from("leads").select("id,name,status,phone,alternate_phone,firm_name,additional_contacts,deleted_at,site_location,site_plus_code,construction_stage,estimated_quantity,material_interests").eq("id", resolvedLeadId).maybeSingle(),
        supabase.from("lead_professionals").select("professional_id,is_primary_contact,contact_designation,professionals(id,name,phone,professional_type)").eq("lead_id", resolvedLeadId),
        supabase.from("tasks").select("id,created_at,completed_at,completion_notes,reschedule_reason,status,assigned_to,lead_id,related_entity_type,related_entity_id").eq("lead_id", resolvedLeadId).order("created_at", { ascending: false }).limit(50),
        supabase.from("tasks").select("id,created_at,completed_at,completion_notes,reschedule_reason,status,assigned_to,lead_id,related_entity_type,related_entity_id").eq("related_entity_type", "lead").eq("related_entity_id", resolvedLeadId).order("created_at", { ascending: false }).limit(50),
      ]);
      if (leadResult.error) throw leadResult.error;
      if (profResult.error) throw profResult.error;
      if (taskResult.error) throw taskResult.error;
      if (legacyTaskResult.error) throw legacyTaskResult.error;

      setLead(leadResult.data as LeadBriefLead | null);
      const professionalMap = new Map<string, LeadBriefProfessional>();
      for (const row of (profResult.data || []) as any[]) {
        if (!row.professionals) continue;
        professionalMap.set(row.professionals.id, { id: row.professionals.id, name: row.professionals.name, phone: row.professionals.phone || null, designation: row.contact_designation || row.professionals.professional_type || null });
      }
      if (directProfessional) professionalMap.set(directProfessional.id, { id: directProfessional.id, name: directProfessional.name, phone: directProfessional.phone, designation: directProfessional.professional_type });
      setProfessionals(Array.from(professionalMap.values()));

      const taskMap = new Map<string, any>();
      for (const item of [...(taskResult.data || []), ...(legacyTaskResult.data || [])]) taskMap.set(item.id, item);
      const tasks = Array.from(taskMap.values());
      const taskIds = tasks.map((t) => t.id);
      let activity: any[] = [];
      if (taskIds.length) {
        const result = await supabase.from("task_activity_log" as any).select("id,task_id,created_at,event_type,user_name,notes,metadata").in("task_id", taskIds).order("created_at", { ascending: false }).limit(100);
        if (!result.error) activity = result.data || [];
      }

      const entries: LeadBriefTrailEntry[] = [];
      const seen = new Set<string>();
      const addEntry = (entry: LeadBriefTrailEntry) => {
        const key = `${entry.taskId}:${entry.type}:${entry.text}`;
        if (!seen.has(key)) { seen.add(key); entries.push(entry); }
      };
      for (const task of tasks) {
        const isCompleted = /completed|done|closed/i.test(task.status || "") || Boolean(task.completed_at);
        const isRescheduled = /resched/i.test(task.status || "") || Boolean(task.reschedule_reason);
        if (isCompleted && task.completion_notes?.trim()) addEntry({ id: `${task.id}:completed`, taskId: task.id, createdAt: task.completed_at || task.created_at, author: task.assigned_to || "", type: "completed", text: task.completion_notes.trim() });
        if (isRescheduled && task.reschedule_reason?.trim()) addEntry({ id: `${task.id}:rescheduled`, taskId: task.id, createdAt: task.created_at, author: task.assigned_to || "", type: "rescheduled", text: task.reschedule_reason.trim() });
      }
      for (const event of activity) {
        const type = /resched|snooz/i.test(event.event_type || "") ? "rescheduled" : /complet/i.test(event.event_type || "") ? "completed" : null;
        if (!type) continue;
        const text = (event.notes || event.metadata?.completion_notes || event.metadata?.reschedule_reason || "").toString().trim();
        if (!text) continue;
        addEntry({ id: event.id, taskId: event.task_id, createdAt: event.created_at, author: event.user_name || "", type, text });
      }
      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTrail(entries.slice(0, 2));
    } catch (error) {
      console.error("Failed to load lead brief:", error);
      setLead(null); setProfessionals([]); setTrail([]);
    } finally { setLoading(false); }
  }, [enabled, leadId, taskId]);

  useEffect(() => { void load(); }, [load]);
  return { lead, professionals, trail, loading, refetch: load };
}
