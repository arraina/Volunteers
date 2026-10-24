import { QuickBooksReportLine } from './quickbooksReport';

const normalize = (value: string) => value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const definitions = [
  ['General Income', 'General donation', ['general donation', 'general donation income']],
  ['Active income', 'Govinda Snacks', ['govinda snak', 'govinda snack', 'govinda snacks', 'govinda snaks']],
  ['Active income', 'Facility Income', ['facility income']],
  ['Active income', 'Religious Ceremony', ['religious ceremony', 'religious ceremonies']],
  ['Active income', 'Day of Gaura Nitai', ['day of gaura nitai']],
  ['Active income', 'Spiritual Education', ['spiritual education']],
  ['Active income', 'Gift Shop', ['gift shop']],
  ['Active income', 'Catering', ['catering']],
  ['Active income', 'Miscellaneous', ['miscellaneous', 'miscellaneous income']],
  ['Active income', 'Other', ['other', 'other income']],
  ['General Expenses', 'Utility', ['utility', 'utilities']],
  ['General Expenses', 'Maintenance', ['maintenance']],
  ['General Expenses', 'Insurance', ['insurance']],
  ['General Expenses', 'Devotee Maintenance', ['devotee maintenance']],
  ['General Expenses', 'Temple Operation', ['temple operation', 'temple operations']],
  ['General Expenses', 'Other', ['other', 'other expense', 'other expenses']],
  ['New Temple', 'New Temple Expense', ['new temple expense', 'new temple expenses']],
  ['New Temple', 'New Temple Donation', ['new temple donation', 'new temple donations']],
  ['New Temple', 'New Temple', ['new temple']],
] as const;

export interface SplitCategory { key: string; group: string; label: string; count: number; accounts: string[]; }

export function transactionSelectionTotal(lines: QuickBooksReportLine[], columns: any[]) {
  const index = columns.findIndex(column => [column.ColTitle, ...(column.MetaData || []).filter((m: any) => m.Name === 'ColKey').map((m: any) => m.Value)]
    .some(value => normalize(String(value || '')) === 'amount'));
  const rows = lines.filter(line => !line.heading);
  let cents = 0;
  const excluded: { row: QuickBooksReportLine; rowNumber: number; rawAmount: string; reason: string }[] = [];
  for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
    const row = lines[rowIndex];
    if (row.heading) continue;
    const original = index < 0 ? '' : lineSplit(row, index);
    const exclude = (reason: string) => excluded.push({ row, rowNumber: rowIndex + 1, rawAmount: original, reason });
    let raw = original.trim();
    const parentheses = /^\(.*\)$/.test(raw);
    if (parentheses) raw = raw.slice(1, -1).trim();
    const sign = raw.startsWith('-') ? -1 : 1;
    raw = raw.replace(/^[+-]/, '').replace(/^\$/, '');
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw) || (parentheses && sign < 0)) {
      exclude(index < 0 ? 'Amount column not returned by QuickBooks' : !original.trim() ? 'Missing amount' : 'Unsupported amount format'); continue;
    }
    const [whole, fraction = ''] = raw.replace(/,/g, '').split('.');
    const value = (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (parentheses ? -1 : sign);
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(cents + value)) { exclude('Amount exceeds safe calculation precision'); continue; }
    cents += value;
  }
  return { amountIndex: index, rows: rows.length, missing: excluded.length, included: rows.length - excluded.length, excluded, cents: index < 0 ? null : cents };
}

export function splitColumnIndex(columns: any[]): number {
  return columns.findIndex(column => [column.ColTitle, ...(column.MetaData || []).filter((m: any) => m.Name === 'ColKey').map((m: any) => m.Value)]
    .some(value => ['split', 'split acc', 'split account'].includes(normalize(String(value || '')))));
}

export function splitCategory(value: string): Omit<SplitCategory, 'count' | 'accounts'> {
  const raw = value.trim(); const normalized = normalize(raw);
  if (!raw) return { key: 'blank', group: 'Unmapped / other accounts', label: 'No Split value' };
  if (['split', 'multiple', 'multiple accounts'].includes(normalized)) return { key: 'multiple', group: 'Unmapped / other accounts', label: 'Multiple accounts — detail unavailable' };
  const parts = raw.split(':').map(normalize); const leaf = parts[parts.length - 1];
  const grouped = (group: string, label = raw) => ({ key: `${group}/${label}`, group, label });
  // One exclusive result per row. New Temple takes precedence even when an
  // account path also contains "Festival", "General Income", or "Expenses".
  if (/\bnew temple\b/.test(normalized)) {
    if (['new temple donation', 'new temple donations', 'donation', 'donations'].includes(leaf)) return grouped('New Temple', 'New Temple Donation');
    if (['new temple expense', 'new temple expenses', 'expense', 'expenses'].includes(leaf)) return grouped('New Temple', 'New Temple Expense');
    if (normalized === 'new temple') return grouped('New Temple', 'New Temple');
    return grouped('New Temple');
  }
  // Prefer the most specific subaccount's direction over a parent label.
  const direction = parts.slice().reverse().find(part => /\b(expenses?|income|donations?)\b/.test(part)) || '';
  const isExpense = /\bexpenses?\b/.test(direction);
  const isIncome = /\b(income|donations?)\b/.test(direction);
  if (/\bfestivals?\b/.test(normalized) && (isExpense || isIncome)) return grouped(isExpense ? 'Festival Expenses' : 'Festival Income');
  if (/\bgeneral donations?\b/.test(normalized)) {
    return grouped(isExpense ? 'General Expenses' : 'General Income',
      ['general donation', 'general donation income'].includes(leaf) && !isExpense ? 'General donation' : raw);
  }
  const active = parts.some(p => ['active income', 'activities income', 'activity income'].includes(p));
  const expense = parts.some(p => ['general expenses', 'general expense', 'expenses'].includes(p));
  for (const [group, label, aliases] of definitions) {
    if (!(aliases as readonly string[]).includes(leaf)) continue;
    // "Other" needs its parent to distinguish income from expenses.
    if (label === 'Other' && !(group === 'Active income' ? active : expense)) continue;
    if (group === 'Active income' && expense) continue;
    if (group === 'General Expenses' && active) continue;
    if (group === 'New Temple' && label === 'New Temple' && parts.length > 1) continue;
    return { key: `${group}/${label}`, group, label };
  }
  if (/\bgeneral (income|expenses?)\b/.test(normalized)) return grouped(isExpense ? 'General Expenses' : 'General Income');
  return { key: `raw:${raw}`, group: 'Unmapped / other accounts', label: raw };
}

/** Filtering is a predicate on original rows, never a concatenation of group/category lists. */
export function filterSplitSelection(lines: QuickBooksReportLine[], index: number, selection: string | string[]): QuickBooksReportLine[] {
  const selections = Array.isArray(selection) ? selection : selection ? [selection] : [];
  if (!selections.length || index < 0) return lines;
  return lines.filter(line => {
    if (line.heading) return false;
    const category = splitCategory(lineSplit(line, index));
    return selections.some(key => key.startsWith('group:') ? category.group === key.slice(6) : category.key === key);
  });
}

export function lineSplit(line: QuickBooksReportLine, index: number): string {
  return index === 0 ? line.label : line.values[index - 1] || '';
}

export function availableSplitCategories(lines: QuickBooksReportLine[], index: number): SplitCategory[] {
  if (index < 0) return [];
  const categories = new Map<string, SplitCategory>();
  for (const line of lines.filter(l => !l.heading)) {
    const raw = lineSplit(line, index); const category = splitCategory(raw);
    const item = categories.get(category.key) || { ...category, count: 0, accounts: [] };
    item.count++; if (raw && !item.accounts.includes(raw)) item.accounts.push(raw);
    categories.set(category.key, item);
  }
  const groups = ['General Income', 'Active income', 'Festival Income', 'General Expenses', 'Festival Expenses', 'New Temple', 'Unmapped / other accounts'];
  return Array.from(categories.values()).sort((a,b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.label.localeCompare(b.label));
}
