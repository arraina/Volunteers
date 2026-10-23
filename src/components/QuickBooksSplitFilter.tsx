import React from 'react';
import { SplitCategory } from '../helpers/quickbooksCategories';

export default function QuickBooksSplitFilter({ categories, selected, onChange, available }: {
  categories: SplitCategory[]; selected: string; onChange: (key: string) => void; available: boolean;
}) {
  if (!available) return <p className="muted small" role="status">QuickBooks did not return a Split column for this report. Category filtering is unavailable; all report rows remain visible.</p>;
  const groups = Array.from(new Set(categories.map(category => category.group)));
  const current = categories.find(category => category.key === selected);
  return <div className="quickbooks-category-filter">
    <label><span>Temple Categories</span><select value={selected} onChange={event => onChange(event.target.value)}>
      <option value="">All categories</option>
      {groups.map(group => <optgroup label={group} key={group}>{categories.filter(category => category.group === group).map(category =>
        <option key={category.key} value={category.key}>{category.label} ({category.count} rows)</option>
      )}</optgroup>)}
    </select></label>
    <p className="muted small">Only categories found in the loaded date range are listed. Filtering does not change QuickBooks or the Hub’s financial records. CSV export uses the filtered rows.</p>
    {current && <p className="muted small">QuickBooks Split values: {current.accounts.join('; ') || 'Blank'}. Report-wide totals are hidden while a category is selected; they are not category totals.</p>}
    {categories.some(category => category.key === 'multiple') && <p className="muted small">Some transactions show “-Split-” rather than an account name. Their individual categories cannot be identified from this report; see “Multiple accounts — detail unavailable.”</p>}
  </div>;
}
