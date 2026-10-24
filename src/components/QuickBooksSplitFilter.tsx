import React from 'react';
import { SplitCategory } from '../helpers/quickbooksCategories';

export default function QuickBooksSplitFilter({ categories, selected, onChange, available }: {
  categories: SplitCategory[]; selected: string[]; onChange: (keys: string[]) => void; available: boolean;
}) {
  if (!available) return <p className="muted small" role="status">QuickBooks did not return a Split column for this report. Category filtering is unavailable; all report rows remain visible.</p>;
  const groups = Array.from(new Set(categories.map(category => category.group)));
  const selectedItems = categories.filter(category => selected.includes(category.key));
  const accounts = Array.from(new Set(selectedItems.flatMap(category => category.accounts)));
  const toggle = (keys: string[], checked: boolean) => onChange(checked
    ? Array.from(new Set([...selected, ...keys]))
    : selected.filter(key => !keys.includes(key)));
  return <div className="quickbooks-category-filter">
    <details className="quickbooks-category-picker">
      <summary>Temple Categories — {selected.length ? `${selectedItems.length} selected` : 'All categories'}</summary>
      <p className="muted small">Select multiple categories or whole groups. With no selections, all categories are shown.</p>
      <button type="button" className="secondary-btn" disabled={!selected.length} onClick={() => onChange([])}>Clear filters / show all</button>
      <div className="quickbooks-category-options">
        {groups.map(group => {
          const items = categories.filter(category => category.group === group);
          const keys = items.map(category => category.key);
          const checked = keys.every(key => selected.includes(key));
          const partial = !checked && keys.some(key => selected.includes(key));
          return <fieldset key={group}><legend>{group}</legend>
            <label className="quickbooks-category-choice"><input type="checkbox" checked={checked}
              ref={node => { if (node) node.indeterminate = partial; }}
              onChange={event => toggle(keys, event.target.checked)} />
              All {group} ({items.reduce((sum, category) => sum + category.count, 0)} rows)
            </label>
            {items.map(category => <label className="quickbooks-category-choice quickbooks-category-child" key={category.key}>
              <input type="checkbox" checked={selected.includes(category.key)} onChange={event => toggle([category.key], event.target.checked)} />
              {category.label} ({category.count} rows)
            </label>)}
          </fieldset>;
        })}
      </div>
    </details>
    <p className="muted small">Only categories found in the loaded date range are listed. Filtering does not change QuickBooks or the Hub's financial records. CSV export uses the filtered rows.</p>
    {selected.length > 0 && <p className="muted small">QuickBooks Split values: {accounts.join('; ') || 'Blank'}. Each transaction row is counted once, even when a group and its categories overlap. Report-wide totals are hidden while filters are selected.</p>}
    {categories.some(category => category.key === 'multiple') && <p className="muted small">Some transactions show “-Split-” rather than an account name. Their individual categories cannot be identified from this report; see “Multiple accounts — detail unavailable.”</p>}
  </div>;
}
