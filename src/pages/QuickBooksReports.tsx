import React, { useEffect, useMemo, useState } from 'react';
import { connectQuickBooks, disconnectQuickBooks, getQuickBooksReport, getQuickBooksStatus, QuickBooksReportType, QuickBooksStatus } from '../helpers/quickbooks';

interface ReportLine { label: string; values: string[]; depth: number; heading: boolean; }
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function reportLines(rows: any[], depth = 0): ReportLine[] {
  return (rows || []).flatMap((row) => {
    const header = row.Header?.ColData || []; const summary = row.Summary?.ColData || []; const data = row.ColData?.length ? row.ColData : header.length ? header : summary;
    const line = data.length ? [{ label: String(data[0]?.value || ''), values: data.slice(1).map((cell: any) => String(cell?.value || '')), depth, heading: Boolean(row.Header) }] : [];
    return [...line, ...reportLines(row.Rows?.Row || [], depth + (row.Header ? 1 : 0)), ...(summary.length ? [{ label: String(summary[0]?.value || ''), values: summary.slice(1).map((cell: any) => String(cell?.value || '')), depth, heading: true }] : [])];
  });
}

const QuickBooksReports: React.FC<{ setError: (message: string) => void }> = ({ setError }) => {
  const now = new Date(); const yearStart = new Date(now.getFullYear(), 0, 1);
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [reportType, setReportType] = useState<QuickBooksReportType>('ProfitAndLoss');
  const [startDate, setStartDate] = useState(isoDate(yearStart)); const [endDate, setEndDate] = useState(isoDate(now));
  const [report, setReport] = useState<any>(null); const [loading, setLoading] = useState(false);

  useEffect(() => { getQuickBooksStatus().then(setStatus).catch((error) => setError(error.message)); }, [setError]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('quickbooks');
    if (result === 'connected') window.history.replaceState({}, '', window.location.pathname);
    if (result === 'error') setError('QuickBooks could not be connected. Check the callback URI and Sandbox credentials, then try again.');
  }, [setError]);
  const columns = report?.Columns?.Column || []; const lines = useMemo(() => reportLines(report?.Rows?.Row || []), [report]);

  const load = async () => { setLoading(true); setError(''); try { const result = await getQuickBooksReport(reportType, startDate, endDate); setReport(result.report); } catch (error) { setError(error instanceof Error ? error.message : 'Could not load QuickBooks report.'); } finally { setLoading(false); } };
  const exportCsv = () => {
    if (!report) return; const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [[report?.Header?.ReportName || reportType, ...columns.slice(1).map((column: any) => column.ColTitle || '')], ...lines.map((line) => [`${'  '.repeat(line.depth)}${line.label}`, ...line.values])];
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `quickbooks-${reportType}-${endDate}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  if (status === null) return <section className="panel"><div className="loading">Checking QuickBooks connection…</div></section>;
  if (!status.connected) return <section className="panel quickbooks-connect"><div><p className="eyebrow">OWNER ONLY</p><h2>QuickBooks reports</h2><p>Connect the QuickBooks Sandbox company to securely view accounting reports. No credentials or tokens are exposed in the browser.</p></div><button className="primary-btn" onClick={() => connectQuickBooks().catch((error) => setError(error.message))}>Connect QuickBooks Sandbox</button></section>;

  return <section className="panel quickbooks-reports"><div className="panel-head"><div><p className="eyebrow">QUICKBOOKS SANDBOX</p><h2>Accounting reports</h2><p className="muted small">Connected company ID: {status.companyId}</p></div><button className="danger-btn" onClick={async () => { if (!window.confirm('Disconnect QuickBooks? Reports will stop loading until the Owner reconnects.')) return; await disconnectQuickBooks(); setStatus({ ...status, connected: false }); setReport(null); }}>Disconnect</button></div>
    <div className="quickbooks-controls"><label><span>Report</span><select value={reportType} onChange={(event) => { setReportType(event.target.value as QuickBooksReportType); setReport(null); }}><option value="ProfitAndLoss">Profit &amp; Loss</option><option value="BalanceSheet">Balance Sheet</option><option value="TransactionList">Transaction List</option></select></label><label><span>Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button className="primary-btn" disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Run report'}</button>{report && <button className="secondary-btn" onClick={exportCsv}>Export CSV</button>}</div>
    {report && <div className="quickbooks-report-table"><div className="quickbooks-report-title"><strong>{report.Header?.ReportName || reportType}</strong><span>{report.Header?.StartPeriod} to {report.Header?.EndPeriod}</span></div><table><thead><tr>{columns.map((column: any, index: number) => <th key={index}>{column.ColTitle || (index === 0 ? 'Account' : '')}</th>)}</tr></thead><tbody>{lines.map((line, index) => <tr className={line.heading ? 'heading' : ''} key={index}><td style={{ paddingLeft: `${0.75 + line.depth * 1.1}rem` }}>{line.label}</td>{Array.from({ length: Math.max(0, columns.length - 1) }, (_, valueIndex) => <td key={valueIndex}>{line.values[valueIndex] || ''}</td>)}</tr>)}</tbody></table></div>}
  </section>;
};

export default QuickBooksReports;
