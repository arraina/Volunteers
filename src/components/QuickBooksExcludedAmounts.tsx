import React from 'react';
import { transactionSelectionTotal } from '../helpers/quickbooksCategories';

export default function QuickBooksExcludedAmounts({ total, columns }: {
  total: ReturnType<typeof transactionSelectionTotal>; columns: any[];
}) {
  if (!total.missing) return null;
  return <>
    <p className="muted small" role="note">
      {total.cents === null ? 'QuickBooks did not return an Amount column.' : `Partial total: includes ${total.included} of ${total.rows} transaction rows.`}
      {' '}{total.missing} rows with missing or unsupported amounts are excluded, not treated as zero. The complete selection total is unknown.
    </p>
    <details className="quickbooks-excluded-amounts">
      <summary>View excluded amount details ({total.missing})</summary>
      <p className="muted small">These rows match the current category and search. Values below are exactly as returned by QuickBooks. Row numbers refer to the displayed report order.</p>
      <div className="quickbooks-report-table" tabIndex={0} role="region" aria-label="Rows excluded from the selection total, horizontally scrollable">
        <table><thead><tr><th>Report row</th><th>Exclusion reason</th>{columns.map((column, index) => <th key={index}>{column.ColTitle || `Column ${index + 1}`}</th>)}</tr></thead>
          <tbody>{total.excluded.map(item => <tr key={item.rowNumber}>
            <td>{item.rowNumber}</td><td>{item.reason}</td>
            {columns.map((_, index) => <td key={index}>{(index === 0 ? item.row.label : item.row.values[index - 1]) || '—'}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </>;
}
