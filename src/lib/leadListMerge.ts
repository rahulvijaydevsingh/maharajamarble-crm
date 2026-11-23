export interface MergeableLeadRecord {
  id: string;
  updated_at?: string | null;
}

function hasNewerTimestamp(
  current: MergeableLeadRecord,
  incoming: MergeableLeadRecord,
): boolean {
  if (!current.updated_at || !incoming.updated_at) {
    return false;
  }

  const currentTime = Date.parse(current.updated_at);
  const incomingTime = Date.parse(incoming.updated_at);

  return !Number.isNaN(currentTime) && !Number.isNaN(incomingTime) && incomingTime < currentTime;
}

function withoutUndefined<T extends MergeableLeadRecord>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export function upsertLeadById<T extends MergeableLeadRecord>(
  list: readonly T[],
  incoming: T,
): T[] {
  const existingIndex = list.findIndex((lead) => lead.id === incoming.id);

  if (existingIndex === -1) {
    return [incoming, ...list];
  }

  const existing = list[existingIndex];
  if (hasNewerTimestamp(existing, incoming)) {
    return [...list];
  }

  const nextList = [...list];
  nextList[existingIndex] = { ...existing, ...withoutUndefined(incoming) } as T;
  return nextList;
}