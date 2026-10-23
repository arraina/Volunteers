export interface QuickBooksReportLine {
  label: string;
  values: string[];
  depth: number;
  heading: boolean;
}

export interface QuickBooksReportSort {
  column: number;
  direction: 'asc' | 'desc';
}

/** Keep report summaries distinct from transactions so filters cannot count totals as data. */
export function quickBooksReportLines(rows: any[], depth = 0): QuickBooksReportLine[] {
  return (rows || []).flatMap(row => {
    const data = row.ColData?.length ? row.ColData : row.Header?.ColData || [];
    const summary = row.Summary?.ColData || [];
    const make = (cells: any[], heading: boolean): QuickBooksReportLine => ({
      label: String(cells[0]?.value || ''), values: cells.slice(1).map(cell => String(cell?.value || '')), depth, heading,
    });
    return [
      ...(data.length ? [make(data, Boolean(row.Header) || row.type === 'Section')] : []),
      ...quickBooksReportLines(row.Rows?.Row || [], depth + (row.Header ? 1 : 0)),
      ...(summary.length ? [make(summary, true)] : []),
    ];
  });
}

const numericValue = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed || !/[0-9]/.test(trimmed)) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const parsed = Number(trimmed.replace(/[$,%(),]/g, ''));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
};

const cellValue = (line: QuickBooksReportLine, column: number) => column === 0 ? line.label : line.values[column - 1] || '';

export function visibleQuickBooksLines(lines: QuickBooksReportLine[], query: string, sort: QuickBooksReportSort | null): QuickBooksReportLine[] {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? lines.filter(line => [line.label, ...line.values].some(value => value.toLocaleLowerCase().includes(needle)))
    : lines;
  if (!sort) return filtered;
  return filtered.map((line, index) => ({ line, index })).sort((a, b) => {
    const left = cellValue(a.line, sort.column); const right = cellValue(b.line, sort.column);
    const leftNumber = numericValue(left); const rightNumber = numericValue(right);
    const comparison = leftNumber !== null && rightNumber !== null
      ? leftNumber - rightNumber
      : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    return (comparison || a.index - b.index) * (sort.direction === 'asc' ? 1 : -1);
  }).map(item => item.line);
}
