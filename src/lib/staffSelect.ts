import type { ActiveStaffMember } from "@/hooks/useActiveStaff";

export const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  sales_user: "Sales",
  sales_viewer: "Viewer",
  field_agent: "Field Agent",
};

export function getRoleLabel(role: string | null | undefined) {
  return role ? roleLabels[role] || role : "Unassigned";
}

export function truncateRoleLabel(roleLabel: string, max = 30) {
  if (roleLabel.length <= max) return roleLabel;
  return roleLabel.slice(0, Math.max(0, max - 3)).trimEnd() + "...";
}

export function buildStaffGroups(staffMembers: ActiveStaffMember[]) {
  const normalized = staffMembers.map((m) => ({
    ...m,
    _roleLabel: truncateRoleLabel(getRoleLabel(m.role)),
  }));

  // Detect duplicate names within a role group to append an identifier
  const keyCounts = new Map<string, number>();
  for (const m of normalized) {
    const key = `${m._roleLabel}::${m.name}`;
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }

  const withDisplay = normalized.map((m) => {
    const key = `${m._roleLabel}::${m.name}`;
    const isDup = (keyCounts.get(key) || 0) > 1;
    const suffix = isDup ? ` (${m.email || m.id.slice(0, 6)})` : "";
    return {
      ...m,
      _display: `${m._roleLabel} - ${m.name}${suffix}`,
    };
  });

  const roleOrder = (label: string) => (label === "Unassigned" ? "zzzz" : label.toLowerCase());

  const sorted = withDisplay.sort((a, b) => {
    const ra = roleOrder(a._roleLabel);
    const rb = roleOrder(b._roleLabel);
    if (ra !== rb) return ra.localeCompare(rb);
    return a.name.localeCompare(b.name);
  });

  const groups = new Map<string, typeof sorted>();
  for (const m of sorted) {
    const arr = groups.get(m._roleLabel) || [];
    arr.push(m);
    groups.set(m._roleLabel, arr);
  }

  return Array.from(groups.entries()).map(([label, members]) => ({
    label,
    members,
  }));
}
