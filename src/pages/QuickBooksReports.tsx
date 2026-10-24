import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { connectQuickBooks, disconnectQuickBooks, getQuickBooksReport, getQuickBooksStatus, QuickBooksReportType, QuickBooksStatus } from '../helpers/quickbooks';
import { quickBooksReportLines, QuickBooksReportSort, visibleQuickBooksLines } from '../helpers/quickbooksReport';
import QuickBooksSplitFilter from '../components/QuickBooksSplitFilter';
import QuickBooksExcludedAmounts from '../components/QuickBooksExcludedAmounts';
import { availableSplitCategories, filterSplitSelection, splitColumnIndex, transactionSelectionTotal } from '../helpers/quickbooksCategories';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const QuickBooksReports: React.FC<{ setError: (message: string) => void }> = ({ setError }) => {
  const now = new Date(); const yearStart = new Date(now.getFullYear(), 0, 1);
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [reportType, setReportType] = useState<QuickBooksReportType>('ProfitAndLoss');
  const isReceivables = reportType === 'AgedReceivables' || reportType === 'AgedReceivableDetail';
  const [startDate, setStartDate] = useState(isoDate(yearStart)); const [endDate, setEndDate] = useState(isoDate(now));
  const [report, setReport] = useState<any>(null); const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(''); const [sort, setSort] = useState<QuickBooksReportSort | null>(null);
  const [category, setCategory] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollId = useId();
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  useEffect(() => { getQuickBooksStatus().then(setStatus).catch((error) => setError(error.message)); }, [setError]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('quickbooks');
    if (result === 'connected') window.history.replaceState({}, '', window.location.pathname);
    if (result === 'error') setError('QuickBooks could not be connected. Check the production callback URI and credentials, then try again.');
  }, [setError]);
  const columns = report?.Columns?.Column || []; const lines = useMemo(() => quickBooksReportLines(report?.Rows?.Row || []), [report]);
  const splitIndex = useMemo(() => splitColumnIndex(report?.Columns?.Column || []), [report]);
  const categories = useMemo(() => availableSplitCategories(lines, splitIndex), [lines, splitIndex]);
  const visibleLines = useMemo(() => visibleQuickBooksLines(
    reportType === 'TransactionList' && category && splitIndex >= 0
      ? filterSplitSelection(lines, splitIndex, category)
      : lines, search, sort
  ), [lines, search, sort, category, splitIndex, reportType]);
  const selectionTotal = useMemo(() => transactionSelectionTotal(visibleLines, report?.Columns?.Column || []), [visibleLines, report]);
  const selectionCurrency = report?.Header?.Currency || 'USD';
  const totalDisplay = selectionTotal.cents === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: selectionCurrency }).format(selectionTotal.cents / 100);
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const update = () => setScrollEdges({ left: viewport.scrollLeft > 2, right: viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 2 });
    update(); viewport.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(viewport);
    const table = viewport.querySelector('table'); if (table) observer?.observe(table);
    return () => { viewport.removeEventListener('scroll', update); window.removeEventListener('resize', update); observer?.disconnect(); };
  }, [report, visibleLines]);
  const scrollColumns = (direction: number) => scrollRef.current?.scrollBy({ left: direction * Math.max(200, scrollRef.current.clientWidth * 0.7), behavior: 'smooth' });
  const changeSort = (column: number) => setSort(current => current?.column === column
    ? current.direction === 'asc' ? { column, direction: 'desc' } : null
    : { column, direction: 'asc' });
  const sortIndicator = (column: number) => sort?.column === column ? sort.direction === 'asc' ? ' ↑' : ' ↓' : '';

  const load = async () => { setLoading(true); setError(''); setCategory(''); setReport(null); setSearch(''); setSort(null); try { const result = await getQuickBooksReport(reportType, startDate, endDate); setReport(result.report); } catch (error) { setError(error instanceof Error ? error.message : 'Could not load QuickBooks report.'); } finally { setLoading(false); } };
  const exportCsv = () => {
    if (!report) return; const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [[report?.Header?.ReportName || reportType, ...columns.slice(1).map((column: any) => column.ColTitle || '')], ...visibleLines.map((line) => [`${'  '.repeat(line.depth)}${line.label}`, ...line.values])];
    if (reportType === 'TransactionList' && selectionTotal.cents !== null) {
      const totalRow = Array(columns.length).fill(''); totalRow[0] = selectionTotal.missing ? 'Selected transactions PARTIAL total' : 'Selected transactions total';
      totalRow[selectionTotal.amountIndex] = (selectionTotal.cents / 100).toFixed(2); rows.push(totalRow);
      if (selectionTotal.missing) {
        const noteRow = Array(columns.length).fill(''); noteRow[0] = `WARNING: Partial total includes ${selectionTotal.included} of ${selectionTotal.rows} rows; ${selectionTotal.missing} missing or unsupported amounts excluded. Complete total unknown.`;
        rows.push(noteRow);
      }
    }
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `quickbooks-${reportType}-${endDate}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  if (status === null) return <section className="panel"><div className="loading">Checking QuickBooks connection…</div></section>;
  if (!status.connected) return <section className="panel quickbooks-connect"><div><p className="eyebrow">FUNDRAISING ADMIN ACCESS</p><h2>QuickBooks reports</h2><p>{status.canManageConnection ? "Connect the temple's live QuickBooks Online company to securely view accounting reports. No credentials or tokens are exposed in the browser." : 'QuickBooks is not connected. Ask the Hub Owner to connect or reconnect the temple company.'}</p></div>{status.canManageConnection && <button className="primary-btn" onClick={() => connectQuickBooks().catch((error) => setError(error.message))}>Connect QuickBooks</button>}</section>;

  return <section className="panel quickbooks-reports"><div className="panel-head"><div><p className="eyebrow">QUICKBOOKS ONLINE · LIVE</p><h2>Accounting reports</h2><p className="muted small">Connected company ID: {status.companyId}</p></div>{status.canManageConnection && <button className="danger-btn" onClick={async () => { if (!window.confirm('Disconnect QuickBooks? Reports will stop loading until the Owner reconnects.')) return; const result = await disconnectQuickBooks(); setStatus({ ...status, connected: false }); setReport(null); if (!result.revocationConfirmed) setError('The Hub removed its local QuickBooks connection, but Intuit did not confirm remote revocation. Review the QuickBooks app connections and contact support if it remains listed.'); }}>Disconnect</button>}</div>
    <div className="quickbooks-controls"><label><span>Report</span><select disabled={loading} value={reportType} onChange={(event) => { setReportType(event.target.value as QuickBooksReportType); setCategory(''); setReport(null); setSearch(''); setSort(null); }}><option value="ProfitAndLoss">Profit &amp; Loss</option><option value="BalanceSheet">Balance Sheet</option><option value="TransactionList">Transaction List</option><option value="AgedReceivables">Accounts Receivable Aging Summary</option><option value="AgedReceivableDetail">Accounts Receivable Aging Detail</option></select></label><label><span>Start date{isReceivables ? ' (not used)' : ''}</span><input type="date" value={startDate} disabled={loading || isReceivables} onChange={(event) => { setStartDate(event.target.value); setReport(null); setCategory(''); }} /></label><label><span>{isReceivables ? 'As-of date' : 'End date'}</span><input type="date" value={endDate} disabled={loading} onChange={(event) => { setEndDate(event.target.value); setReport(null); setCategory(''); }} /></label><button className="primary-btn" disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Run report'}</button>{report && <button className="secondary-btn" onClick={exportCsv}>Export CSV</button>}</div>
    {isReceivables && <p className="muted small">Outstanding QuickBooks receivables as of the selected date. Aging is calculated using that date, not today. Hub-only pledges are not included unless recorded in QuickBooks as receivables.</p>}
    {report && reportType === 'TransactionList' && <QuickBooksSplitFilter categories={categories} selected={category} onChange={setCategory} available={splitIndex >= 0} />}
    {report && reportType === 'TransactionList' && <div className="quickbooks-category-filter" role="status" aria-live="polite">
      <span>{selectionTotal.missing && selectionTotal.cents !== null ? 'Partial dollar value of selection' : 'Total dollar value of selection'}</span><h3>{totalDisplay}</h3>
      <p className="muted small">{selectionTotal.rows} transaction rows · {selectionCurrency}. Follows the selected category and search. Signed sum of QuickBooks Amount values; negative amounts reduce the total. Not a profit or bank-balance calculation.</p>
      <QuickBooksExcludedAmounts total={selectionTotal} columns={columns} />
    </div>}
    {report && <><div className="quickbooks-report-tools"><label><span>Search report</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search accounts, names, dates, or amounts" /></label><span className="muted small">Showing {visibleLines.length.toLocaleString()} of {lines.length.toLocaleString()} rows</span>{sort && <button type="button" className="secondary-btn" onClick={() => setSort(null)}>Restore QuickBooks order</button>}</div>{sort && <p className="muted small quickbooks-sort-note">Sorted view temporarily flattens the accounting hierarchy. Restore QuickBooks order to see the original statement structure.</p>}{(scrollEdges.left || scrollEdges.right) && <div className="quickbooks-scroll-hint"><span role="status">{scrollEdges.right ? 'More columns to the right →' : '← More columns to the left'} <small>Scroll horizontally or use the arrows.</small></span><div><button type="button" className="secondary-btn" aria-label="Scroll report columns left" aria-controls={scrollId} disabled={!scrollEdges.left} onClick={() => scrollColumns(-1)}>← Left</button><button type="button" className="secondary-btn" aria-label="Scroll report columns right" aria-controls={scrollId} disabled={!scrollEdges.right} onClick={() => scrollColumns(1)}>Right →</button></div></div>}<div className="quickbooks-report-table" id={scrollId} ref={scrollRef} tabIndex={0} role="region" aria-label="QuickBooks report, horizontally scrollable"><div className="quickbooks-report-title"><strong>{report.Header?.ReportName || reportType}</strong><span>{report.Header?.StartPeriod} to {report.Header?.EndPeriod}</span></div><table><thead><tr>{columns.map((column: any, index: number) => <th key={index}><button type="button" className="quickbooks-sort-button" onClick={() => changeSort(index)} aria-label={`Sort by ${column.ColTitle || (index === 0 ? 'Account' : `column ${index + 1}`)}`}>{column.ColTitle || (index === 0 ? 'Account' : '')}{sortIndicator(index)}</button></th>)}</tr></thead><tbody>{visibleLines.map((line, index) => <tr className={line.heading ? 'heading' : ''} key={`${line.label}-${index}`}><td style={{ paddingLeft: `${0.4 + line.depth * 0.65}rem` }}>{line.label}</td>{Array.from({ length: Math.max(0, columns.length - 1) }, (_, valueIndex) => <td key={valueIndex}>{line.values[valueIndex] || ''}</td>)}</tr>)}</tbody></table>{!visibleLines.length && <div className="empty-state"><strong>No report rows found</strong><span>Try a different search.</span></div>}</div></>}
  </section>;
};

export default QuickBooksReports;
