export interface AdvancedRule {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than" | "is_true" | "is_false";
  value: string;
  logic?: "AND" | "OR";
}

export interface Context {
  getLeadTasks?: (leadId: string) => { total: number; overdue: number; dueToday: number; upcoming: number };
  getCustomerTasks?: (customerId: string) => { total: number; overdue: number; dueToday: number; upcoming: number };
}

export function evaluateRule(record: Record<string, any>, rule: AdvancedRule, context?: Context): boolean {
  let fieldValue: any;

  if (rule.field === "tasks_status") {
    const taskInfo = context?.getLeadTasks ? context.getLeadTasks(record.id) :
                     context?.getCustomerTasks ? context.getCustomerTasks(record.id) : null;
    if (!taskInfo) return true;
    if (rule.value === "no_tasks") return taskInfo.total === 0;
    if (rule.value === "has_tasks") return taskInfo.total > 0;
    if (rule.value === "has_overdue") return taskInfo.overdue > 0;
    if (rule.value === "due_today") return taskInfo.dueToday > 0;
    if (rule.value === "has_upcoming") return taskInfo.upcoming > 0;
    return true;
  } else if (rule.field === "overdue_tasks") {
    const taskInfo = context?.getLeadTasks ? context.getLeadTasks(record.id) :
                     context?.getCustomerTasks ? context.getCustomerTasks(record.id) : null;
    fieldValue = taskInfo?.overdue ?? 0;
  } else if (rule.field === "pending_tasks") {
    const taskInfo = context?.getLeadTasks ? context.getLeadTasks(record.id) :
                     context?.getCustomerTasks ? context.getCustomerTasks(record.id) : null;
    fieldValue = taskInfo?.total ?? 0;
  } else if (rule.field === "due_today_tasks") {
    const taskInfo = context?.getLeadTasks ? context.getLeadTasks(record.id) :
                     context?.getCustomerTasks ? context.getCustomerTasks(record.id) : null;
    fieldValue = taskInfo?.dueToday ?? 0;
  } else if (rule.field === "upcoming_tasks") {
    const taskInfo = context?.getLeadTasks ? context.getLeadTasks(record.id) :
                     context?.getCustomerTasks ? context.getCustomerTasks(record.id) : null;
    fieldValue = taskInfo?.upcoming ?? 0;
  } else if (rule.field === "has_parent_task") {
    return record.parent_task_id != null;
  } else {
    fieldValue = record[rule.field];
  }

  switch (rule.operator) {
    case "equals":
      return String(fieldValue ?? "").toLowerCase() === String(rule.value ?? "").toLowerCase();
    case "not_equals":
      return String(fieldValue ?? "").toLowerCase() !== String(rule.value ?? "").toLowerCase();
    case "contains":
      return String(fieldValue ?? "").toLowerCase().includes(String(rule.value ?? "").toLowerCase());
    case "not_contains":
      return !String(fieldValue ?? "").toLowerCase().includes(String(rule.value ?? "").toLowerCase());
    case "greater_than":
      return parseFloat(String(fieldValue ?? 0)) > parseFloat(String(rule.value ?? 0));
    case "less_than":
      return parseFloat(String(fieldValue ?? 0)) < parseFloat(String(rule.value ?? 0));
    case "is_true":
      return fieldValue === true || fieldValue === "true" || fieldValue === 1;
    case "is_false":
      return !(fieldValue === true || fieldValue === "true" || fieldValue === 1);
    default:
      return true;
  }
}

export function evaluateRules(record: Record<string, any>, rules: AdvancedRule[], context?: Context): boolean {
  if (!rules || rules.length === 0) return true;
  let result = evaluateRule(record, rules[0], context);
  for (let i = 1; i < rules.length; i++) {
    const ruleResult = evaluateRule(record, rules[i], context);
    if (rules[i].logic === "OR") {
      result = result || ruleResult;
    } else {
      result = result && ruleResult;
    }
  }
  return result;
}
