export type DonorSortField = 'firstName' | 'lastName' | 'phone' | 'email' | 'address';
export function compareDonorFields(a: Record<DonorSortField, string> & { id: string }, b: Record<DonorSortField, string> & { id: string }, field: DonorSortField, direction: 'asc' | 'desc') {
  const value = (record: typeof a) => field === 'phone' ? record.phone.replace(/\D/g, '') : record[field].trim();
  const left = value(a); const right = value(b);
  if (!left !== !right) return left ? -1 : 1;
  const result = left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true });
  return (direction === 'asc' ? result : -result) || a.id.localeCompare(b.id);
}
