export function recordLastUpdated(updatedAt: Date | null | undefined, createdAt: Date | null | undefined, auditedAt: Date | null | undefined): Date | null {
  const dates = [updatedAt, createdAt, auditedAt].filter((date): date is Date => Boolean(date) && Number.isFinite(date!.getTime()));
  return dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))) : null;
}

export function compareOptionalDates(left: Date | null, right: Date | null, direction: 'asc' | 'desc'): number {
  if (Boolean(left) !== Boolean(right)) return left ? -1 : 1;
  if (!left || !right) return 0;
  return (direction === 'asc' ? 1 : -1) * (left.getTime() - right.getTime());
}
