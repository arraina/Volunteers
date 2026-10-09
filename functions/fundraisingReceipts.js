const methods = ['zelle', 'check', 'cash', 'card', 'bank-transfer', 'other'];
const modes = ['single', 'installments'];
const frequencies = ['monthly', 'quarterly', 'annual', 'custom'];
function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100000000) throw new Error('Enter an amount greater than zero.');
  const rounded = Math.round(value * 100) / 100;
  if (rounded <= 0) throw new Error('Amount must be at least one cent.');
  return rounded;
}
function date(value, past = false, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Enter a valid date.');
  if (past && value > today) throw new Error('Received and repayment dates cannot be in the future.');
  return value;
}
function text(value, max = 5000) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Text must be within ${max} characters.`);
  return value.trim();
}
function receipt(input) {
  if (!['donation', 'loan'].includes(input.kind)) throw new Error('Choose donation or loan.');
  if (!methods.includes(input.method)) throw new Error('Choose a payment method.');
  const result = { kind: input.kind, donorId: text(input.donorId, 180), eventId: text(input.eventId, 180), sourceCampaignEntryId: text(input.sourceCampaignEntryId, 180), amount: money(input.amount), receivedDate: date(input.receivedDate, true), method: input.method, reference: text(input.reference, 300), receivedBy: text(input.receivedBy, 180), designation: text(input.designation, 300), receiptNumber: text(input.receiptNumber, 180), notes: text(input.notes) };
  if (!/^[\w-]{1,180}$/.test(result.donorId)) throw new Error('Link a donor or lender record first.');
  if (input.kind === 'loan') {
    if (!modes.includes(input.repaymentMode)) throw new Error('Choose single repayment or installments.');
    result.dueDate = date(input.dueDate);
    if (result.dueDate < result.receivedDate) throw new Error('Loan due date cannot precede the received date.');
    result.repaymentMode = input.repaymentMode;
    result.frequency = input.repaymentMode === 'installments' ? input.frequency : '';
    if (input.repaymentMode === 'installments' && !frequencies.includes(input.frequency)) throw new Error('Choose an installment frequency.');
    result.installmentAmount = input.repaymentMode === 'installments' ? money(input.installmentAmount) : 0;
    if (result.installmentAmount > result.amount) throw new Error('Installment amount cannot exceed the loan principal.');
    result.nextRepaymentDate = input.nextRepaymentDate ? date(input.nextRepaymentDate) : '';
    if (input.repaymentMode === 'installments' && !result.nextRepaymentDate) throw new Error('Enter the next installment date.');
    if (result.nextRepaymentDate && (result.nextRepaymentDate < result.receivedDate || result.nextRepaymentDate > result.dueDate)) throw new Error('Next repayment date must be between the received and final due dates.');
  }
  return result;
}
function repayment(input) {
  if (!methods.includes(input.method)) throw new Error('Choose a repayment method.');
  return { amount: money(input.amount), paidDate: date(input.paidDate, true), method: input.method, reference: text(input.reference, 300), paidBy: text(input.paidBy, 180), notes: text(input.notes) };
}
function returned(payments) { return Math.round(payments.reduce((sum, item) => sum + item.amount, 0) * 100) / 100; }
module.exports = { receipt, repayment, returned };
