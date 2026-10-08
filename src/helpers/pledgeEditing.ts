export function comparePledgeDates(a: { id: string; pledgeDate: Date | null }, b: { id: string; pledgeDate: Date | null }, direction: 'asc' | 'desc'): number {
  const left = a.pledgeDate?.getTime(); const right = b.pledgeDate?.getTime();
  const leftKnown = left !== undefined && Number.isFinite(left); const rightKnown = right !== undefined && Number.isFinite(right);
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  const difference = leftKnown && rightKnown ? left! - right! : 0;
  return (direction === 'asc' ? difference : -difference) || a.id.localeCompare(b.id);
}
