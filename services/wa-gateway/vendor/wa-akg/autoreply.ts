import type { AutoReplyRule, AutoReplyRuleSource } from "../../src/ports/index";

/**
 * Pure keyword-matching function ported from WA-AKG store/autoreply.ts (Sec 9.2).
 * Note: In the worker, AutoReplyRuleSource is empty because the CRM's
 * whatsapp-inbound router is the single auto-reply brain (ADR-0009).
 */
export function matchAutoReplyRule(
  incomingText: string,
  rules: AutoReplyRule[],
): AutoReplyRule | null {
  const normalizedInput = incomingText.trim().toLowerCase();
  if (!normalizedInput) {
    return null;
  }

  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    for (const rawKw of rule.keywords) {
      const keyword = rawKw.trim().toLowerCase();
      if (!keyword) continue;

      if (rule.matchType === "exact" && normalizedInput === keyword) {
        return rule;
      }
      if (rule.matchType === "starts_with" && normalizedInput.startsWith(keyword)) {
        return rule;
      }
      if (rule.matchType === "contains" && normalizedInput.includes(keyword)) {
        return rule;
      }
    }
  }

  return null;
}

export class EmptyAutoReplyRuleSource implements AutoReplyRuleSource {
  async getRulesForSession(_sessionKey: string): Promise<AutoReplyRule[]> {
    return [];
  }
}
