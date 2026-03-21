export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "greater_than_or_equal"
  | "greater_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "less_or_equal"
  | "before"
  | "after"
  | "today"
  | "this_week"
  | "this_month"
  | "last_7_days"
  | "last_30_days"
  | "next_7_days"
  | "next_30_days"
  | "is_true"
  | "is_false";

export interface AdvancedRule {
  field: string;
  operator: FilterOperator;
  value: string;
  logic?: "AND" | "OR";
}

export interface Context {
  getLeadTasks?: (leadId: string) => { total: number; overdue: number; dueToday: number; upcoming: number };
  getCustomerTasks?: (customerId: string) => { total: number; overdue: number; dueToday: number; upcoming: number };
}

function isEmpty(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function toDateMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateValue(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function evaluateDateOperator(fieldValue: any, operator: FilterOperator, ruleValue: string): boolean {
  const now = new Date();
  const today = toDateMidnight(now);
  const fieldDate = parseDateValue(fieldValue);

  switch (operator) {
    case "today": {
      if (!fieldDate) return false;
      const fd = toDateMidnight(fieldDate);
      return fd.getTime() === today.getTime();
    }
    case "this_week": {
      if (!fieldDate) return false;
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const fd = toDateMidnight(fieldDate);
      return fd >= startOfWeek && fd <= endOfWeek;
    }
    case "this_month": {
      if (!fieldDate) return false;
      return fieldDate.getFullYear() === now.getFullYear() && fieldDate.getMonth() === now.getMonth();
    }
    case "last_7_days": {
      if (!fieldDate) return false;
      const cutoff = new Date(today);
      cutoff.setDate(today.getDate() - 7);
      return fieldDate >= cutoff && fieldDate <= now;
    }
    case "last_30_days": {
      if (!fieldDate) return false;
      const cutoff = new Date(today);
      cutoff.setDate(today.getDate() - 30);
      return fieldDate >= cutoff && fieldDate <= now;
    }
    case "next_7_days": {
      if (!fieldDate) return false;
      const cutoff = new Date(today);
      cutoff.setDate(today.getDate() + 7);
      return fieldDate >= today && fieldDate <= cutoff;
    }
    case "next_30_days": {
      if (!fieldDate) return false;
      const cutoff = new Date(today);
      cutoff.setDate(today.getDate() + 30);
      return fieldDate >= today && fieldDate <= cutoff;
    }
    case "before": {
      if (!fieldDate) return false;
      const compareDate = parseDateValue(ruleValue);
      if (!compareDate) return false;
      return toDateMidnight(fieldDate) < toDateMidnight(compareDate);
    }
    case "after": {
      if (!fieldDate) return false;
      const compareDate = parseDateValue(ruleValue);
      if (!compareDate) return false;
      return toDateMidnight(fieldDate) > toDateMidnight(compareDate);
    }
    case "equals": {
      if (!fieldDate) return false;
      const compareDate = parseDateValue(ruleValue);
      if (!compareDate) return false;
      return toDateMidnight(fieldDate).getTime() === toDateMidnight(compareDate).getTime();
    }
    default:
      return true;
  }
}

export function evaluateRule(record: Record<string, any>, rule: AdvancedRule, context?: Context): boolean {
  let fieldValue: any;

  if (rule.field === "tasks_status") {
    const taskInfo = context?.getLeadTasks
      ? context.getLeadTasks(record.id)
      : context?.getCustomerTasks
      ? context.getCustomerTasks(record.id)
      : null;
    if (!taskInfo) return true;
    if (rule.value === "no_tasks")     return taskInfo.total === 0;
    if (rule.value === "has_tasks")    return taskInfo.total > 0;
    if (rule.value === "has_overdue")  return taskInfo.overdue > 0;
    if (rule.value === "due_today")    return taskInfo.dueToday > 0;
    if (rule.value === "has_upcoming") return taskInfo.upcoming > 0;
    return true;
  } else if (rule.field === "overdue_tasks") {
    const taskInfo = context?.getLeadTasks
      ? context.getLeadTasks(record.id)
      : context?.getCustomerTasks
      ? context.getCustomerTasks(record.id)
      : null;
    fieldValue = taskInfo?.overdue ?? 0;
  } else if (rule.field === "pending_tasks") {
    const taskInfo = context?.getLeadTasks
      ? context.getLeadTasks(record.id)
      : context?.getCustomerTasks
      ? context.getCustomerTasks(record.id)
      : null;
    fieldValue = taskInfo?.total ?? 0;
  } else if (rule.field === "due_today_tasks") {
    const taskInfo = context?.getLeadTasks
      ? context.getLeadTasks(record.id)
      : context?.getCustomerTasks
      ? context.getCustomerTasks(record.id)
      : null;
    fieldValue = taskInfo?.dueToday ?? 0;
  } else if (rule.field === "upcoming_tasks") {
    const taskInfo = context?.getLeadTasks
      ? context.getLeadTasks(record.id)
      : context?.getCustomerTasks
      ? context.getCustomerTasks(record.id)
      : null;
    fieldValue = taskInfo?.upcoming ?? 0;
  } else if (rule.field === "has_parent_task") {
    return record.parent_task_id != null;
  } else {
    fieldValue = record[rule.field];
  }

  const dateOps: FilterOperator[] = [
    "today", "this_week", "this_month",
    "last_7_days", "last_30_days",
    "next_7_days", "next_30_days",
    "before", "after",
  ];
  if (dateOps.includes(rule.operator)) {
    return evaluateDateOperator(fieldValue, rule.operator, rule.value);
  }

  const strValue = String(fieldValue ?? "").toLowerCase();
  const strRule  = String(rule.value  ?? "").toLowerCase();
  const numValue = parseFloat(String(fieldValue ?? 0));
  const numRule  = parseFloat(String(rule.value  ?? 0));

  switch (rule.operator) {
    case "equals":        return strValue === strRule;
    case "not_equals":    return strValue !== strRule;
    case "contains":      return strValue.includes(strRule);
    case "not_contains":  return !strValue.includes(strRule);
    case "starts_with":   return strValue.startsWith(strRule);
    case "ends_with":     return strValue.endsWith(strRule);
    case "is_empty":      return isEmpty(fieldValue);
    case "is_not_empty":  return !isEmpty(fieldValue);
    case "greater_than":  return numValue > numRule;
    case "greater_than_or_equal":
    case "greater_or_equal": return numValue >= numRule;
    case "less_than":     return numValue < numRule;
    case "less_than_or_equal":
    case "less_or_equal":    return numValue <= numRule;
    case "is_true":  return fieldValue === true || fieldValue === "true" || fieldValue === 1;
    case "is_false": return !(fieldValue === true || fieldValue === "true" || fieldValue === 1);
    default:         return true;
  }
}

export function evaluateRules(
  record: Record<string, any>,
  rules: AdvancedRule[],
  context?: Context
): boolean {
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
