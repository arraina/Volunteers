import React, { useState } from 'react';
import { QuickBooksReportLine } from '../helpers/quickbooksReport';

export function transactionLetterBody(columns: Array<{ ColTitle?: string }>, rows: QuickBooksReportLine[], reportName: string, currency: string, period: string): string {
  return `Subject: Transaction details\n\nPlease find below the details of the selected transactions recorded in QuickBooks.\n\nReport: ${reportName}\nReporting period: ${period}\nCurrency: ${currency}\n\n${rows.map((row, index) => `Transaction ${index + 1}\n${columns.map((column, i) => `${column.ColTitle || `Column ${i + 1}`}: ${[row.label, ...row.values][i] || 'Not provided'}`).join('\n')}`).join('\n\n')}\n\nPlease contact us if you have any questions or require further clarification.\n\nSincerely,\nISKCON Of Parsippany`;
}

const QuickBooksTransactionLetter: React.FC<{ columns: Array<{ ColTitle?: string }>; rows: QuickBooksReportLine[]; reportName: string; currency: string; period: string; onClose: () => void }> = ({ columns, rows, reportName, currency, period, onClose }) => {
  const nameIndex = columns.findIndex(column => /^(name|customer( full)? name|donor( name)?|from\/to)$/i.test(column.ColTitle || ''));
  const names = Array.from(new Set(rows.map(row => [row.label, ...row.values][nameIndex]?.trim()).filter(Boolean)));
  const [recipient, setRecipient] = useState(names.length === 1 ? names[0] : '');
  const [body, setBody] = useState(() => transactionLetterBody(columns, rows, reportName, currency, period));
  const [error, setError] = useState('');
  const date = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' });
  const print = () => {
    if (!recipient.trim() || !body.trim()) { setError('Enter the recipient name and letter text before printing.'); return; }
    const preview = window.open('', '_blank', 'width=900,height=800');
    if (!preview) { setError('Allow pop-ups for the Hub to open the print preview.'); return; }
    // Only text nodes are used: report values and edits cannot inject HTML or scripts.
    const doc = preview.document; doc.title = 'ISKCON Of Parsippany — Transaction letter';
    const style = doc.createElement('style');
    style.textContent = '@page{size:letter;margin:0.8in}body{font:12pt Georgia,serif;color:#17251d;max-width:7in;margin:32px auto;padding:0 20px}header{text-align:center;border-bottom:2px solid #327b43;padding-bottom:18px;margin-bottom:28px}h1{font-size:24pt;margin:0}header p{font-size:11pt;letter-spacing:2px}article{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}button{margin-bottom:20px;padding:10px 18px}@media print{body{margin:0;padding:0;max-width:none}button{display:none}}';
    doc.head.appendChild(style);
    const button = doc.createElement('button'); button.textContent = 'Print / Save as PDF'; button.onclick = () => preview.print(); doc.body.appendChild(button);
    const header = doc.createElement('header'); const title = doc.createElement('h1'); title.textContent = 'ISKCON Of Parsippany'; header.appendChild(title); const subtitle = doc.createElement('p'); subtitle.textContent = 'TRANSACTION CORRESPONDENCE'; header.appendChild(subtitle); doc.body.appendChild(header);
    const article = doc.createElement('article'); article.textContent = `${date}\n\nDear ${recipient.trim()},\n\n${body}`; doc.body.appendChild(article);
    preview.focus(); preview.print();
  };
  return <section className="panel" role="region" aria-label="Editable transaction letter">
    <h3>ISKCON Of Parsippany</h3><p>{rows.length} selected transaction{rows.length === 1 ? '' : 's'}. Edit this letter before printing. Changes here do not update QuickBooks.</p>
    <label style={{ display: 'block', marginBottom: 16 }}><span>Recipient name *</span><input style={{ display: 'block', width: '100%' }} value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="Name of the person receiving this letter" /></label>
    <label style={{ display: 'block' }}><span>Letter text *</span><textarea style={{ display: 'block', width: '100%', minHeight: 420, padding: 16, lineHeight: 1.6, fontFamily: 'Georgia, serif' }} value={body} onChange={event => setBody(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}><button type="button" className="primary-btn" onClick={print}>Print letter</button><button type="button" className="secondary-btn" onClick={onClose}>Close letter</button></div>
  </section>;
};
export default QuickBooksTransactionLetter;
