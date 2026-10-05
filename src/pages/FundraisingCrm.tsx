import React, { useEffect, useMemo, useState } from 'react';
import { TempleEvent } from '../helpers/types';
import { addDonorInteraction, CampaignSummary, donorDuplicateKeys, DonorContactInteraction, FundraisingDonor, FundraisingPledge, FundraisingPledgePayment, loadCampaignSummaries, PledgePaymentMethod, PledgePaymentStatus, recordFundraisingPledgePayment, saveFundraisingDonor, saveFundraisingPledge, subscribeDonorInteractions, subscribeFundraisingDonors, subscribeFundraisingPledgePayments, subscribeFundraisingPledges, uploadFundraisingDonorPicture } from '../helpers/fundraisingCrm';
import QuickBooksReports from './QuickBooksReports';
import { getDepartmentDirectory } from '../helpers/departments';
import { pledgeReviewReasons } from '../helpers/pledgeReview';

const blankDonor = (): FundraisingDonor => ({
  id: '', firstName: '', lastName: '', title: '', middleInitial: '', initiatedName: '', email: '', phone: '', officePhone: '', organization: '', address: '', city: '', state: '', postalCode: '', country: '',
  homePhone: '', previousHomePhone: '', phoneVerified: false, phoneAppendDate: null, doNotCall: false, doNotMail: false, noMailReason: '', receiptDelivery: '', receiptingPreference: '', pictureUrl: '', picturePath: '', futurePledge: false, fiveKAmount: 0,
  spouseName: '', weddingAnniversary: null, birthDate: null, spouseBirthDate: null,
  children: Array.from({ length: 5 }, () => ({ name: '', birthDate: null })), lastDonationDate: null, lastDonationAmount: 0, biggestDonationDate: null, biggestDonationAmount: 0,
  autoDeductDonationAmount: 0, autoDeductBillingAmount: 0, monthlyDonor: false, autoDeductPledgeAmount: 0, autoDeductPledgeStart: null, autoDeductPledgeRemaining: 0,
  cardLastFour: '', cardBillingAddress: '', cardBillingZip: '', facebookUrl: '', linkedinUrl: '', twitterHandle: '', websiteUrl: '', gotra: '', status: 'active', tags: [], notes: '', nextFollowUp: null, assignedTo: '', archived: false, createdAt: null, updatedAt: null,
});
const blankPledge = (): FundraisingPledge => ({ id: '', donorId: '', eventId: '', donorFirstName: '', donorLastName: '', sourceCampaignEntryId: '', purpose: '', pledgedAmount: 0, paidAmount: 0, openBalanceKnown: true, openBalanceSource: '', pledgeDate: new Date(), dueDate: null, nextPaymentDate: null, frequency: 'one-time', status: 'active', cancellationReason: '', cancelledAt: null, cancelledBy: '', notes: '', createdAt: null, updatedAt: null });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const dateValue = (date: Date | null) => date ? date.toISOString().slice(0, 10) : '';
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const donorName = (donor?: FundraisingDonor) => donor ? [donor.firstName, donor.lastName].filter(Boolean).join(' ') || donor.organization : 'Unknown donor';
const duplicateText = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

function possibleDuplicateKeys(donor: FundraisingDonor): string[] {
  const keys = donorDuplicateKeys(donor);
  const legalName = duplicateText(`${donor.firstName} ${donor.lastName}`);
  const initiatedName = duplicateText(donor.initiatedName);
  if (legalName.length >= 5) keys.push(`name:${legalName}`);
  if (initiatedName.length >= 5) keys.push(`initiated:${initiatedName}`);
  return Array.from(new Set(keys));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

const normalizeCsvHeader = (header: string) => header.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function csvDate(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function csvBoolean(value: string): boolean {
  return ['true', 'yes', 'y', '1', 'archived'].includes(value.trim().toLowerCase());
}

const FundraisingCrm: React.FC<{ events: TempleEvent[]; uid?: string; setError: (message: string) => void }> = ({ events, uid, setError }) => {
  const [donors, setDonors] = useState<FundraisingDonor[]>([]);
  const [fundraisingAdminNames, setFundraisingAdminNames] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [pledges, setPledges] = useState<FundraisingPledge[]>([]);
  const [pledgePayments, setPledgePayments] = useState<FundraisingPledgePayment[]>([]);
  const [interactions, setInteractions] = useState<DonorContactInteraction[]>([]);
  const [view, setView] = useState<'donors' | 'raw' | 'pledges' | 'campaigns' | 'followups' | 'reports'>('donors');
  const [donorDataset, setDonorDataset] = useState<'fundraisingCuratedDonors' | 'fundraisingDonors'>('fundraisingCuratedDonors');
  const [editing, setEditing] = useState<FundraisingDonor | null>(null);
  const [editingPledge, setEditingPledge] = useState<FundraisingPledge | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [donorDisplayLimit, setDonorDisplayLimit] = useState(100);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [donorLoadComplete, setDonorLoadComplete] = useState(false);
  const [donorRefresh, setDonorRefresh] = useState(0);
  const [pledgeSearch, setPledgeSearch] = useState('');
  const [checkReviewDays, setCheckReviewDays] = useState(14);
  const [cancellationReason, setCancellationReason] = useState('');
  const [callDate, setCallDate] = useState(dateValue(new Date()));
  const [callNotes, setCallNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(dateValue(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PledgePaymentMethod>('zelle');
  const [paymentStatus, setPaymentStatus] = useState<PledgePaymentStatus>('received');
  const [paymentReceivedBy, setPaymentReceivedBy] = useState('');
  const [paymentDepositedDate, setPaymentDepositedDate] = useState('');
  const [paymentReceiptNumber, setPaymentReceiptNumber] = useState('');
  const [paymentDesignation, setPaymentDesignation] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentComments, setPaymentComments] = useState('');

  useEffect(() => {
    setDonors([]); setDonorLoadComplete(false);
    return subscribeFundraisingDonors((records, complete) => { setDonors(records); setDonorLoadComplete(complete); }, (error) => setError(error.message), donorDataset);
  }, [setError, donorRefresh, donorDataset]);
  useEffect(() => subscribeFundraisingPledges(setPledges, (error) => setError(error.message)), [setError]);
  useEffect(() => {
    let active = true;
    getDepartmentDirectory().then((directory) => {
      if (active) setFundraisingAdminNames(Array.from(new Set(directory.memberships
        .filter((member) => member.departmentId === 'fundraising' && member.role === 'admin')
        .map((member) => member.name.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)));
    }).catch(() => { if (active) setFundraisingAdminNames([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => subscribeFundraisingPledgePayments(setPledgePayments, (error) => setError(error.message)), [setError]);
  useEffect(() => subscribeDonorInteractions(setInteractions, (error) => setError(error.message)), [setError]);
  useEffect(() => { loadCampaignSummaries(Object.fromEntries(events.map((event) => [event.id, event.name]))).then(setCampaigns).catch((error) => setError(error.message)); }, [events, setError]);

  const duplicateIds = useMemo(() => {
    const seen = new Map<string, string[]>();
    donors.filter((donor) => !donor.archived).forEach((donor) => possibleDuplicateKeys(donor).forEach((key) => seen.set(key, [...(seen.get(key) || []), donor.id])));
    return new Set(Array.from(seen.values()).filter((ids) => ids.length > 1).flat());
  }, [donors]);
  const filtered = donors.filter((donor) => (showArchived || !donor.archived) && `${donor.firstName} ${donor.lastName} ${donor.initiatedName} ${donor.email} ${donor.phone} ${donor.organization} ${donor.address} ${donor.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const visibleDonors = filtered.slice(0, donorDisplayLimit);
  const followups = donors.filter((donor) => !donor.archived && donor.nextFollowUp).sort((a, b) => Number(a.nextFollowUp) - Number(b.nextFollowUp));
  const totals = campaigns.reduce((result, campaign) => ({ current: result.current + campaign.current, target: result.target + campaign.target, pledges: result.pledges + campaign.pledges, donations: result.donations + campaign.donations, loans: result.loans + campaign.loans }), { current: 0, target: 0, pledges: 0, donations: 0, loans: 0 });
  const displayedPledges = useMemo(() => {
    const trackedSources = new Set(pledges.filter((pledge) => pledge.sourceCampaignEntryId).map((pledge) => `${pledge.eventId}:${pledge.sourceCampaignEntryId}`));
    const dashboardPledges: FundraisingPledge[] = campaigns.flatMap((campaign) => campaign.entries
      .filter((entry) => entry.type === 'pledge' && !trackedSources.has(`${campaign.eventId}:${entry.id}`))
      .map((entry) => { const matchingDonor = donors.find((donor) => duplicateText(`${donor.firstName} ${donor.lastName}`) === duplicateText(`${entry.firstName} ${entry.lastName}`)); return { ...blankPledge(), id: `dashboard:${campaign.eventId}:${entry.id}`, donorId: matchingDonor?.id || '', eventId: campaign.eventId, donorFirstName: entry.firstName, donorLastName: entry.lastName, sourceCampaignEntryId: entry.id, purpose: campaign.name, pledgedAmount: entry.amount, notes: entry.comments }; }));
    return [...pledges, ...dashboardPledges];
  }, [campaigns, donors, pledges]);
  const visiblePledges = useMemo(() => {
    const terms = pledgeSearch.toLowerCase().replace(/[$,]/g, '').split(/\s+/).filter(Boolean);
    return displayedPledges.filter((pledge) => {
      const linkedDonor = donors.find((donor) => donor.id === pledge.donorId);
      const eventName = events.find((event) => event.id === pledge.eventId)?.name || campaigns.find((campaign) => campaign.eventId === pledge.eventId)?.name || pledge.purpose;
      const haystack = `${linkedDonor ? donorName(linkedDonor) : `${pledge.donorFirstName} ${pledge.donorLastName}`} ${eventName} ${pledge.notes} ${pledge.status} ${pledge.pledgedAmount} ${pledge.paidAmount} ${Math.max(0, pledge.pledgedAmount - pledge.paidAmount)} ${pledge.cancellationReason}`.toLowerCase().replace(/[$,]/g, '');
      return terms.every((term) => haystack.includes(term));
    });
  }, [campaigns, displayedPledges, donors, events, pledgeSearch]);
  const activePledges = displayedPledges.filter((pledge) => pledge.status !== 'cancelled');
  const reviewItems = displayedPledges.map((pledge) => ({ pledge, reasons: pledgeReviewReasons(pledge, displayedPledges, pledgePayments, checkReviewDays) })).filter((item) => item.reasons.length);
  const pledgeTotals = activePledges.reduce((total, pledge) => ({ pledged: total.pledged + pledge.pledgedAmount, paid: total.paid + pledge.paidAmount, remaining: total.remaining + (pledge.openBalanceKnown ? Math.max(0, pledge.pledgedAmount - pledge.paidAmount) : 0), unknown: total.unknown + (pledge.openBalanceKnown ? 0 : 1) }), { pledged: 0, paid: 0, remaining: 0, unknown: 0 });

  const openNewDonor = () => {
    setError('');
    setMessage('');
    setCallDate(dateValue(new Date()));
    setCallNotes('');
    setEditing(blankDonor());
  };

  const goToDonorSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const uploadDonorPicture = async (file?: File) => {
    if (!file || !editing) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size >= 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP image smaller than 5 MB.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('The picture could not be read.'));
        reader.readAsDataURL(file);
      });
      const result = await uploadFundraisingDonorPicture(dataUrl);
      setEditing((current) => current ? { ...current, pictureUrl: result.imageUrl, picturePath: result.imagePath } : current);
      setMessage('Donor picture uploaded. Save the donor record to keep it attached.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The donor picture could not be uploaded.'); }
    finally { setSaving(false); }
  };

  const save = async () => {
    if (!editing?.firstName.trim() && !editing?.organization.trim()) return setError('Enter a first name or organization name.');
    if (editing.email && !/^\S+@\S+\.\S+$/.test(editing.email)) return setError('Enter a valid email address or leave it blank.');
    if (editing.cardLastFour && !/^\d{4}$/.test(editing.cardLastFour)) return setError('Card last four must contain exactly four digits, or be left blank.');
    const keys = possibleDuplicateKeys(editing);
    const duplicate = donors.find((donor) => donor.id !== editing.id && !donor.archived && possibleDuplicateKeys(donor).some((key) => keys.includes(key)));
    if (duplicate && !window.confirm(`Possible duplicate: ${duplicate.firstName} ${duplicate.lastName}. Save this donor anyway?`)) return;
    setSaving(true); setError(''); setMessage('');
    try { await saveFundraisingDonor(editing, uid, donorDataset); setEditing(null); setMessage('Donor profile saved.'); setDonorRefresh((value) => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save donor.'); }
    finally { setSaving(false); }
  };

  const setDonorArchived = async (donor: FundraisingDonor, archived: boolean) => {
    const action = archived ? 'remove' : 'restore';
    if (archived && !window.confirm(`Remove ${donorName(donor)} from the active donor list? The record and fundraising history will be preserved.`)) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await saveFundraisingDonor({ ...donor, archived }, uid, donorDataset);
      setMessage(`${donorName(donor)} was ${action === 'remove' ? 'removed from the active donor list' : 'restored'}.`);
      setDonorRefresh((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : `Could not ${action} donor.`); }
    finally { setSaving(false); }
  };

  const recordDonorCall = async () => {
    if (!editing?.id) return setError('Save the donor before recording a call.');
    if (!callDate || !callNotes.trim()) return setError('Enter the call date and notes.');
    setSaving(true); setError(''); setMessage('');
    try {
      await addDonorInteraction(editing.id, new Date(`${callDate}T12:00:00`), callNotes, uid);
      setCallNotes(''); setCallDate(dateValue(new Date())); setMessage('Donor call recorded.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not record the donor call.'); }
    finally { setSaving(false); }
  };

  const importDonors = async (file: File) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The CSV must contain a header row and at least one donor.');
      const headers = rows[0].map(normalizeCsvHeader);
      const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const columns = {
        firstName: column('firstname', 'first', 'givenname'),
        lastName: column('lastname', 'last', 'surname', 'familyname'),
        initiatedName: column('initiatedname', 'spiritualname', 'devotionalname'),
        organization: column('organization', 'organisation', 'company', 'companyname'),
        email: column('email', 'emailaddress', 'emailid'),
        phone: column('phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'cellphone'),
        officePhone: column('officephone', 'workphone', 'businessphone'),
        address: column('address', 'mailingaddress', 'fulladdress'),
        street: column('street', 'streetaddress', 'address1', 'addressline1'),
        city: column('city', 'town'),
        state: column('state', 'province', 'region'),
        postalCode: column('zip', 'zipcode', 'postalcode', 'postcode'),
        status: column('status', 'donorstatus'),
        tags: column('tags', 'tag', 'categories', 'category'),
        assignedTo: column('assignedfundraiser', 'assignedto', 'owner', 'fundraiser'),
        nextFollowUp: column('nextfollowup', 'followupdate', 'nextfollowupdate'),
        notes: column('notes', 'comments', 'comment'),
        archived: column('archived', 'isarchived'),
        spouseName: column('spousename', 'spouse'), birthDate: column('dateofbirth', 'birthdate', 'dob'), spouseBirthDate: column('spousedateofbirth', 'spousebirthdate', 'spousedob'),
        lastDonationDate: column('lastdonationdate'), lastDonationAmount: column('lastdonationamount'), biggestDonationDate: column('biggestdonationdate'), biggestDonationAmount: column('biggestdonationamount'),
        monthlyDonor: column('monthlydonor', 'recurringdonor'), autoDeductDonationAmount: column('autodeductdonationamount'), autoDeductBillingAmount: column('billingamount'),
        autoDeductPledgeAmount: column('pledgeamount'), autoDeductPledgeStart: column('pledgestart', 'pledgestartdate'), autoDeductPledgeRemaining: column('pledgeremaining'),
        cardLastFour: column('cardlastfour', 'cardlast4'), cardBillingAddress: column('cardbillingaddress'), cardBillingZip: column('cardbillingzip'),
        childNames: Array.from({ length: 5 }, (_, index) => column(`child${index + 1}`, `child${index + 1}name`)),
        childBirthDates: Array.from({ length: 5 }, (_, index) => column(`child${index + 1}dateofbirth`, `child${index + 1}birthdate`, `child${index + 1}dob`)),
      };
      const firstIndex = columns.firstName; const organizationIndex = columns.organization;
      if (firstIndex < 0 && organizationIndex < 0) throw new Error('CSV requires a First Name or Organization column.');
      const existingKeys = new Set(donors.flatMap(donorDuplicateKeys)); let imported = 0; let skipped = 0;
      for (const row of rows.slice(1, 501)) {
        const value = (index: number) => index >= 0 ? String(row[index] || '').trim() : '';
        const directAddress = value(columns.address);
        const combinedAddress = [value(columns.street), value(columns.city), value(columns.state), value(columns.postalCode)].filter(Boolean).join(', ');
        const statusValue = value(columns.status).toLowerCase();
        const donor: FundraisingDonor = {
          ...blankDonor(), firstName: value(firstIndex), lastName: value(columns.lastName),
          initiatedName: value(columns.initiatedName), organization: value(organizationIndex),
          email: value(columns.email), phone: value(columns.phone), officePhone: value(columns.officePhone), address: directAddress || combinedAddress,
          spouseName: value(columns.spouseName), birthDate: csvDate(value(columns.birthDate)), spouseBirthDate: csvDate(value(columns.spouseBirthDate)),
          lastDonationDate: csvDate(value(columns.lastDonationDate)), lastDonationAmount: Number(value(columns.lastDonationAmount)) || 0,
          biggestDonationDate: csvDate(value(columns.biggestDonationDate)), biggestDonationAmount: Number(value(columns.biggestDonationAmount)) || 0,
          monthlyDonor: csvBoolean(value(columns.monthlyDonor)), autoDeductDonationAmount: Number(value(columns.autoDeductDonationAmount)) || 0,
          autoDeductBillingAmount: Number(value(columns.autoDeductBillingAmount)) || 0, autoDeductPledgeAmount: Number(value(columns.autoDeductPledgeAmount)) || 0,
          autoDeductPledgeStart: csvDate(value(columns.autoDeductPledgeStart)), autoDeductPledgeRemaining: Number(value(columns.autoDeductPledgeRemaining)) || 0,
          cardLastFour: value(columns.cardLastFour).replace(/\D/g, '').slice(-4), cardBillingAddress: value(columns.cardBillingAddress), cardBillingZip: value(columns.cardBillingZip),
          children: Array.from({ length: 5 }, (_, index) => ({ name: value(columns.childNames[index]), birthDate: csvDate(value(columns.childBirthDates[index])) })),
          status: ['active', 'prospect', 'inactive'].includes(statusValue) ? statusValue as FundraisingDonor['status'] : 'active',
          tags: value(columns.tags).split(/[;,|]/).map((tag) => tag.trim()).filter(Boolean),
          assignedTo: value(columns.assignedTo), nextFollowUp: csvDate(value(columns.nextFollowUp)),
          notes: value(columns.notes), archived: csvBoolean(value(columns.archived)),
        };
        if (!donor.firstName && !donor.organization) { skipped += 1; continue; }
        const keys = donorDuplicateKeys(donor);
        if (keys.some((key) => existingKeys.has(key))) { skipped += 1; continue; }
        await saveFundraisingDonor(donor, uid, donorDataset); keys.forEach((key) => existingKeys.add(key)); imported += 1;
      }
      setMessage(`${imported} donor${imported === 1 ? '' : 's'} imported. Recognized donor fields were mapped; missing fields were left blank. ${skipped} skipped as duplicates or incomplete rows.`);
      setDonorRefresh((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not import donor CSV.'); }
    finally { setSaving(false); }
  };

  const exportDonors = () => {
    const contributionFor = (donor: FundraisingDonor, type: 'pledge' | 'loan' | 'donation') => {
      const name = `${donor.firstName} ${donor.lastName}`.trim().toLowerCase();
      return campaigns.flatMap((campaign) => campaign.entries).filter((entry) => `${entry.firstName} ${entry.lastName}`.trim().toLowerCase() === name && entry.type === type).reduce((sum, entry) => sum + entry.amount, 0);
    };
    const rows: unknown[][] = [['First name', 'Last name', 'Initiated name', 'Organization', 'Email', 'Phone', 'Office phone', 'Home address', 'Spouse name', 'Date of birth', 'Spouse date of birth', 'Child 1', 'Child 1 date of birth', 'Child 2', 'Child 2 date of birth', 'Child 3', 'Child 3 date of birth', 'Child 4', 'Child 4 date of birth', 'Child 5', 'Child 5 date of birth', 'Last donation date', 'Last donation amount', 'Biggest donation date', 'Biggest donation amount', 'Monthly donor', 'Auto-deduct donation amount', 'Billing amount', 'Auto-deduct pledge amount', 'Pledge start', 'Pledge remaining', 'Card last four', 'Card billing address', 'Card billing ZIP', 'Status', 'Tags', 'Assigned fundraiser', 'Next follow-up', 'Dashboard donations', 'Dashboard loans', 'Dashboard pledges', 'Tracked pledge amount', 'Pledge paid', 'Pledge remaining', 'Next pledge due', 'Call history', 'Notes']];
    donors.filter((donor) => !donor.archived).forEach((donor) => {
      const donorPledges = pledges.filter((pledge) => pledge.donorId === donor.id);
      const pledged = donorPledges.reduce((sum, pledge) => sum + pledge.pledgedAmount, 0); const paid = donorPledges.reduce((sum, pledge) => sum + pledge.paidAmount, 0);
      const dueDates = donorPledges.filter((pledge) => pledge.pledgedAmount > pledge.paidAmount && pledge.dueDate).map((pledge) => pledge.dueDate as Date).sort((a, b) => Number(a) - Number(b));
      const children = Array.from({ length: 5 }, (_, index) => donor.children[index] || { name: '', birthDate: null });
      const callHistory = interactions.filter((item) => item.donorId === donor.id).map((item) => `${dateValue(item.calledAt)}: ${item.notes}`).join(' | ');
      rows.push([donor.firstName, donor.lastName, donor.initiatedName, donor.organization, donor.email, donor.phone, donor.officePhone, donor.address, donor.spouseName, dateValue(donor.birthDate), dateValue(donor.spouseBirthDate), ...children.flatMap((child) => [child.name, dateValue(child.birthDate)]), dateValue(donor.lastDonationDate), donor.lastDonationAmount, dateValue(donor.biggestDonationDate), donor.biggestDonationAmount, donor.monthlyDonor ? 'Yes' : 'No', donor.autoDeductDonationAmount, donor.autoDeductBillingAmount, donor.autoDeductPledgeAmount, dateValue(donor.autoDeductPledgeStart), donor.autoDeductPledgeRemaining, donor.cardLastFour, donor.cardBillingAddress, donor.cardBillingZip, donor.status, donor.tags.join('; '), donor.assignedTo, dateValue(donor.nextFollowUp), contributionFor(donor, 'donation'), contributionFor(donor, 'loan'), contributionFor(donor, 'pledge'), pledged, paid, Math.max(0, pledged - paid), dateValue(dueDates[0] || null), callHistory, donor.notes]);
    });
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `fundraising-donors-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  const savePledge = async () => {
    if (!editingPledge) return;
    if (!editingPledge.donorId && !editingPledge.donorFirstName.trim()) return setError('Choose a donor or enter the donor name.');
    if (editingPledge.pledgedAmount <= 0) return setError('Enter a pledged amount greater than zero.');
    if (editingPledge.paidAmount < 0 || editingPledge.paidAmount > editingPledge.pledgedAmount) return setError('Paid amount must be between zero and the pledged amount.');
    setSaving(true); setError(''); setMessage('');
    let pledgeToSave = { ...editingPledge, id: editingPledge.id.startsWith('dashboard:') ? '' : editingPledge.id };
    try {
      if (!pledgeToSave.donorId) {
        const nameKey = duplicateText(`${pledgeToSave.donorFirstName} ${pledgeToSave.donorLastName}`);
        const existingDonor = donors.find((donor) => !donor.archived && duplicateText(`${donor.firstName} ${donor.lastName}`) === nameKey);
        if (existingDonor) pledgeToSave = { ...pledgeToSave, donorId: existingDonor.id };
        else {
          const donor = { ...blankDonor(), firstName: pledgeToSave.donorFirstName, lastName: pledgeToSave.donorLastName, notes: `Created automatically from pledge for ${events.find((event) => event.id === pledgeToSave.eventId)?.name || pledgeToSave.purpose || 'fundraising'}.` };
          const created = await saveFundraisingDonor(donor, uid, 'fundraisingCuratedDonors');
          if (!created) throw new Error('The donor record could not be created.');
          pledgeToSave = { ...pledgeToSave, donorId: created.id };
          setDonorRefresh((value) => value + 1);
        }
      }
      await saveFundraisingPledge(pledgeToSave, uid); setEditingPledge(null); setMessage('Pledge saved and linked to its donor record.');
    }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save pledge.'); }
    finally { setSaving(false); }
  };

  const recordPledgePayment = async () => {
    if (!editingPledge || editingPledge.id.startsWith('dashboard:')) return setError('Save this dashboard pledge first, then reopen it to record payments.');
    if (!uid || !paymentDate || paymentAmount <= 0) return setError('Enter a received date and payment amount greater than zero.');
    if (paymentDate > dateValue(new Date())) return setError('Date received cannot be in the future.');
    setSaving(true); setError(''); setMessage('');
    try {
      await recordFundraisingPledgePayment({ pledgeId: editingPledge.id, amount: paymentAmount, receivedAt: new Date(`${paymentDate}T00:00:00`), method: paymentMethod, status: paymentStatus, receivedBy: paymentReceivedBy, depositedAt: paymentDepositedDate ? new Date(`${paymentDepositedDate}T12:00:00`) : null, receiptNumber: paymentReceiptNumber, designation: paymentDesignation, reference: paymentReference, comments: paymentComments }, uid);
      setEditingPledge({ ...editingPledge, paidAmount: editingPledge.paidAmount + paymentAmount, status: editingPledge.paidAmount + paymentAmount >= editingPledge.pledgedAmount ? 'fulfilled' : 'active' });
      setPaymentAmount(0); setPaymentReference(''); setPaymentComments(''); setPaymentReceivedBy(''); setPaymentDepositedDate(''); setPaymentReceiptNumber(''); setPaymentDesignation(''); setPaymentStatus('received'); setPaymentDate(dateValue(new Date()));
      setMessage('Pledge payment recorded in the payment history.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not record the pledge payment.'); }
    finally { setSaving(false); }
  };

  const cancelPledge = async () => {
    if (!editingPledge || !editingPledge.id || editingPledge.id.startsWith('dashboard:')) return setError('Save this pledge before cancelling it.');
    if (!cancellationReason.trim()) return setError('Enter a cancellation reason before cancelling the pledge.');
    setSaving(true); setError(''); setMessage('');
    try {
      const cancelled = { ...editingPledge, status: 'cancelled' as const, cancellationReason: cancellationReason.trim(), cancelledAt: new Date(), cancelledBy: uid || '' };
      await saveFundraisingPledge(cancelled, uid);
      setEditingPledge(null); setCancellationReason('');
      setMessage('Pledge cancelled. Its record and payment history were retained, and its amounts were removed from active totals.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not cancel the pledge.'); }
    finally { setSaving(false); }
  };

  return <div className="fundraising-crm">
    <datalist id="fundraising-admin-name-options">{fundraisingAdminNames.map((name) => <option value={name} key={name} />)}</datalist>
    <nav className="fundraising-crm-tabs" aria-label="Fundraising CRM sections">
      <button className={view === 'donors' ? 'active' : ''} onClick={() => { setDonorDataset('fundraisingCuratedDonors'); setView('donors'); }}>Donors</button>
      <button className={view === 'raw' ? 'active' : ''} onClick={() => { setDonorDataset('fundraisingDonors'); setView('raw'); }}>Raw Donor Information</button>
      <button className={view === 'pledges' ? 'active' : ''} onClick={() => { setDonorDataset('fundraisingCuratedDonors'); setView('pledges'); }}>Pledges</button>
      <button className={view === 'campaigns' ? 'active' : ''} onClick={() => setView('campaigns')}>Campaigns</button>
      <button className={view === 'followups' ? 'active' : ''} onClick={() => setView('followups')}>Stewardship</button>
      <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>Reports</button>
    </nav>
    {message && <div className="success-message">{message}</div>}
    {(view === 'donors' || view === 'raw') && <section className="panel">
      <div className="panel-head"><div><h2>{view === 'raw' ? 'Raw Donor Information' : 'Donors'}</h2><p className="muted small">{view === 'raw' ? 'Imported source information retained separately for reference and cleanup.' : 'Verified donor profiles entered and maintained by the fundraising team.'}</p></div><div className="row">{view === 'raw' && <label className="secondary-btn fundraising-import-btn">{saving ? 'Importing…' : 'Import raw donor data'}<input type="file" accept=".csv,text/csv" disabled={saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) importDonors(file); event.target.value = ''; }} /></label>}<button className="secondary-btn" onClick={exportDonors}>Export {view === 'raw' ? 'raw data' : 'donors'}</button>{view === 'donors' && <button type="button" className="primary-btn" onClick={openNewDonor}>New donor</button>}</div></div>
      <div className="fundraising-crm-filters"><input value={search} onChange={(event) => { setSearch(event.target.value); setDonorDisplayLimit(100); }} placeholder="Search donors, contact details, or tags" /><label><input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setDonorDisplayLimit(100); }} /> Show archived</label><span className="muted small">Showing {Math.min(visibleDonors.length, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} donors</span></div>
      <div className="fundraising-crm-list">
        <div className="fundraising-donor-list-head"><span>First name</span><span>Last name</span><span>Phone</span><span>Last donation</span><span>Last amount</span><span>Biggest donation</span><span>Biggest amount</span><span>Actions</span></div>
        {visibleDonors.map((donor) => <article className={`fundraising-donor-card${duplicateIds.has(donor.id) ? ' possible-duplicate' : ''}`} key={donor.id} role="button" tabIndex={0} aria-label={`Open ${donorName(donor)} donor record`} onClick={() => setEditing({ ...donor })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEditing({ ...donor }); } }}>
          <span className="fundraising-donor-open">{donor.firstName || donor.organization || '—'}{duplicateIds.has(donor.id) && <small className="duplicate-warning">Possible duplicate</small>}</span>
          <span>{donor.lastName || '—'}</span><span>{donor.phone || '—'}</span>
          <span>{donor.lastDonationDate?.toLocaleDateString() || 'Not recorded'}</span><strong>{donor.lastDonationAmount ? money.format(donor.lastDonationAmount) : '—'}</strong>
          <span>{donor.biggestDonationDate?.toLocaleDateString() || 'Not recorded'}</span><strong>{donor.biggestDonationAmount ? money.format(donor.biggestDonationAmount) : '—'}</strong>
          <div className="fundraising-donor-actions"><button className={donor.archived ? 'secondary-btn' : 'danger-btn'} disabled={saving} onClick={(event) => { event.stopPropagation(); setDonorArchived(donor, !donor.archived); }}>{donor.archived ? 'Restore' : 'Remove'}</button></div>
        </article>)}
        {!filtered.length && <div className="empty-state"><strong>No donors found</strong><span>Add a donor or change the search.</span></div>}
        {visibleDonors.length < filtered.length && <button className="secondary-btn" onClick={() => setDonorDisplayLimit((limit) => limit + 100)}>Load 100 more donors</button>}
      </div>
    </section>}
    {view === 'pledges' && <section className="panel"><div className="panel-head"><div><h2>Pledge tracking</h2><p className="muted small">Track the original commitment, payments received, remaining balance, and due date.</p></div><button className="primary-btn" onClick={() => setEditingPledge(blankPledge())}>Add pledge</button></div>
      <div className="fundraising-pledge-search"><label><span>Smart pledge search</span><input value={pledgeSearch} onChange={(event) => setPledgeSearch(event.target.value)} placeholder="Search donor, event, comments, status, or amount" /></label><span className="muted small">Showing {visiblePledges.length} of {displayedPledges.length} pledge records</span></div>
      <details className="panel pledge-review-list"><summary>Pledges to review ({reviewItems.length})</summary><p className="muted small">Select a record to review the reasons and update its details.</p><label>Review uncleared checks after <input type="number" min="1" max="365" value={checkReviewDays} onChange={(event) => setCheckReviewDays(Math.min(365, Math.max(1, Number(event.target.value) || 14)))} /> days</label>{reviewItems.map(({ pledge, reasons }) => <button type="button" className="secondary-btn" key={pledge.id} onClick={() => { setCancellationReason(pledge.cancellationReason); setEditingPledge({ ...pledge }); }}><strong>{donorName(donors.find((donor) => donor.id === pledge.donorId)) === 'Unknown donor' ? `${pledge.donorFirstName} ${pledge.donorLastName}` : donorName(donors.find((donor) => donor.id === pledge.donorId))} — {money.format(pledge.pledgedAmount)}</strong><span>{events.find((event) => event.id === pledge.eventId)?.name || pledge.purpose || 'General pledge'}</span>{reasons.map((reason) => <span key={reason}>{reason}</span>)}<b>Open record to review →</b></button>)}{!reviewItems.length && <p>No pledges currently meet the review criteria.</p>}</details>
      <div className="fundraising-report-grid fundraising-pledge-totals"><div><span>Total pledged</span><strong>{money.format(pledgeTotals.pledged)}</strong></div><div><span>Paid</span><strong>{money.format(pledgeTotals.paid)}</strong></div><div><span>Known remaining</span><strong>{money.format(pledgeTotals.remaining)}</strong></div></div>
      <div className="fundraising-pledge-list">{visiblePledges.map((pledge) => { const remaining = Math.max(0, pledge.pledgedAmount - pledge.paidAmount); const overdue = Boolean(pledge.status !== 'cancelled' && pledge.openBalanceKnown && remaining > 0 && pledge.dueDate && pledge.dueDate < new Date()); const linkedDonor = donors.find((donor) => donor.id === pledge.donorId); const eventName = events.find((event) => event.id === pledge.eventId)?.name || campaigns.find((campaign) => campaign.eventId === pledge.eventId)?.name || pledge.purpose || 'General pledge'; return <button className={`${overdue ? 'overdue ' : ''}${pledge.status === 'cancelled' ? 'cancelled' : ''}`} onClick={() => { setCancellationReason(pledge.cancellationReason); setEditingPledge({ ...pledge }); }} key={pledge.id}><span><strong>{linkedDonor ? donorName(linkedDonor) : [pledge.donorFirstName, pledge.donorLastName].filter(Boolean).join(' ') || 'Unknown donor'}</strong><small>{eventName}{pledge.sourceCampaignEntryId ? ' · Dashboard pledge' : ''}</small><small className="pledge-comment-preview">{pledge.status === 'cancelled' ? `Cancelled: ${pledge.cancellationReason}` : pledge.notes || 'No comments'}</small></span><span><small>Pledged</small><b>{pledge.status === 'cancelled' ? 'Voided' : money.format(pledge.pledgedAmount)}</b></span><span><small>Paid</small><b>{pledge.status === 'cancelled' ? 'Voided' : pledge.openBalanceKnown ? money.format(pledge.paidAmount) : 'Not provided'}</b></span><span><small>Remaining</small><b>{pledge.status === 'cancelled' ? money.format(0) : pledge.openBalanceKnown ? money.format(remaining) : 'Needs review'}</b></span><span><small>{pledge.status === 'cancelled' ? 'Status' : overdue ? 'Overdue' : pledge.status === 'fulfilled' ? 'Status' : 'Due'}</small><b>{pledge.status === 'cancelled' ? 'Cancelled' : pledge.status === 'fulfilled' ? 'Fulfilled' : pledge.dueDate?.toLocaleDateString() || 'No date'}</b></span></button>; })}{!visiblePledges.length && <div className="empty-state"><strong>No pledges found</strong><span>Change the smart-search terms or add a pledge.</span></div>}</div>
    </section>}
    {view === 'campaigns' && <section className="panel"><div className="panel-head"><div><h2>Campaigns</h2><p className="muted small">Live totals from the existing fundraising dashboards.</p></div></div><div className="fundraising-campaign-list">{campaigns.map((campaign) => <article key={campaign.eventId}><div><strong>{campaign.name}</strong><span>{campaign.donorCount} entries · {campaign.locked ? 'Frozen' : 'Open'}</span></div><b>{money.format(campaign.current)}</b><small>of {money.format(campaign.target)} target</small></article>)}</div></section>}
    {view === 'followups' && <section className="panel"><div className="panel-head"><div><h2>Stewardship</h2><p className="muted small">Upcoming donor calls, acknowledgements, and follow-ups.</p></div></div><div className="fundraising-followups">{followups.map((donor) => <button onClick={() => { setView('donors'); setEditing({ ...donor }); }} key={donor.id}><span><strong>{donor.firstName} {donor.lastName}</strong><small>{donor.assignedTo ? `Assigned to ${donor.assignedTo}` : 'Unassigned'}</small></span><b>{donor.nextFollowUp?.toLocaleDateString()}</b></button>)}{!followups.length && <div className="empty-state"><strong>No follow-ups scheduled</strong><span>Add a date to a donor profile.</span></div>}</div></section>}
    {view === 'reports' && <><section className="panel"><div className="panel-head"><div><h2>Fundraising reports</h2><p className="muted small">Summary across all saved event campaigns.</p></div></div><div className="fundraising-report-grid"><div><span>Total target</span><strong>{money.format(totals.target)}</strong></div><div><span>Donations</span><strong>{money.format(totals.donations)}</strong></div><div><span>Pledges</span><strong>{money.format(totals.pledges)}</strong></div><div><span>Loans</span><strong>{money.format(totals.loans)}</strong></div><div><span>Overall progress</span><strong>{totals.target ? Math.round(totals.current / totals.target * 100) : 0}%</strong></div></div></section><QuickBooksReports setError={setError} /></>}
    {editing && <div className="modal-backdrop"><section className="panel fundraising-donor-editor" role="dialog" aria-modal="true" aria-label="Donor profile"><div className="panel-head" id="donor-profile-main"><div><h2>{editing.id ? donorName(editing) : 'New donor'}</h2><p className="muted small">Complete donor workspace</p></div><button className="link-btn" onClick={() => setEditing(null)}>Close</button></div><nav className="fundraising-donor-tabs" aria-label="Donor record sections"><button type="button" onClick={() => goToDonorSection('donor-profile-main')}>Main</button><button type="button" onClick={() => goToDonorSection('donor-profile-gifts')}>Gifts</button><button type="button" onClick={() => { setEditing(null); setView('pledges'); }}>Pledges</button><button type="button" onClick={() => goToDonorSection('donor-profile-contacts')}>Contacts</button><button type="button" onClick={() => goToDonorSection('donor-profile-bio')}>Bio</button><button type="button" onClick={() => goToDonorSection('donor-profile-addresses')}>Addresses</button><button type="button" onClick={() => goToDonorSection('donor-profile-accounts')}>Accounts</button><button type="button" onClick={() => goToDonorSection('donor-profile-other')}>Other</button></nav><div className="fundraising-donor-form">
      <label><span>First name</span><input value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} /></label><label><span>Last name</span><input value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} /></label>
      <label><span>Title</span><input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} placeholder="Mr., Mrs., Dr., etc." /></label><label><span>Middle initial</span><input maxLength={3} value={editing.middleInitial} onChange={(event) => setEditing({ ...editing, middleInitial: event.target.value })} /></label>
      <label><span>Initiated name (optional)</span><input value={editing.initiatedName} onChange={(event) => setEditing({ ...editing, initiatedName: event.target.value })} /></label>
      <label><span>Organization</span><input value={editing.organization} onChange={(event) => setEditing({ ...editing, organization: event.target.value })} /></label><label><span>Status</span><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as FundraisingDonor['status'] })}><option value="active">Active</option><option value="prospect">Prospect</option><option value="inactive">Inactive</option></select></label>
      <label><span>Email</span><input type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></label><label><span>Mobile phone</span><input type="tel" value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></label>
      <label><span>Office phone</span><input type="tel" value={editing.officePhone} onChange={(event) => setEditing({ ...editing, officePhone: event.target.value })} /></label><label id="donor-profile-bio"><span>Spouse name</span><input value={editing.spouseName} onChange={(event) => setEditing({ ...editing, spouseName: event.target.value })} /></label>
      <label><span>Home phone</span><input type="tel" value={editing.homePhone} onChange={(event) => setEditing({ ...editing, homePhone: event.target.value })} /></label><label><span>Previous home phone</span><input type="tel" value={editing.previousHomePhone} onChange={(event) => setEditing({ ...editing, previousHomePhone: event.target.value })} /></label>
      <label><span>Donor date of birth</span><input type="date" value={dateValue(editing.birthDate)} onChange={(event) => setEditing({ ...editing, birthDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label><span>Spouse date of birth</span><input type="date" value={dateValue(editing.spouseBirthDate)} onChange={(event) => setEditing({ ...editing, spouseBirthDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label>
      <label><span>Wedding anniversary</span><input type="date" value={dateValue(editing.weddingAnniversary)} onChange={(event) => setEditing({ ...editing, weddingAnniversary: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label><span>Gotra</span><input value={editing.gotra} onChange={(event) => setEditing({ ...editing, gotra: event.target.value })} /></label>
      <label className="full" id="donor-profile-addresses"><span>Home address</span><textarea rows={3} value={editing.address} onChange={(event) => setEditing({ ...editing, address: event.target.value })} placeholder="Street address, city, state, ZIP code" /></label>
      <label><span>City</span><input value={editing.city} onChange={(event) => setEditing({ ...editing, city: event.target.value })} /></label><label><span>State</span><input value={editing.state} onChange={(event) => setEditing({ ...editing, state: event.target.value })} /></label>
      <label><span>ZIP / postal code</span><input value={editing.postalCode} onChange={(event) => setEditing({ ...editing, postalCode: event.target.value })} /></label><label><span>Country</span><input value={editing.country} onChange={(event) => setEditing({ ...editing, country: event.target.value })} /></label>
      <h3 className="full fundraising-form-section">Children</h3>
      {Array.from({ length: 5 }, (_, index) => { const child = editing.children[index] || { name: '', birthDate: null }; return <React.Fragment key={index}><label><span>Child {index + 1} name</span><input value={child.name} onChange={(event) => { const children = [...editing.children]; children[index] = { ...child, name: event.target.value }; setEditing({ ...editing, children }); }} /></label><label><span>Child {index + 1} date of birth</span><input type="date" value={dateValue(child.birthDate)} onChange={(event) => { const children = [...editing.children]; children[index] = { ...child, birthDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null }; setEditing({ ...editing, children }); }} /></label></React.Fragment>; })}
      <h3 className="full fundraising-form-section" id="donor-profile-gifts">Gifts and donation summary</h3>
      <label><span>Last donation date</span><input type="date" value={dateValue(editing.lastDonationDate)} onChange={(event) => setEditing({ ...editing, lastDonationDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label><span>Last donation amount</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editing.lastDonationAmount || ''} onChange={(event) => setEditing({ ...editing, lastDonationAmount: Number(event.target.value) || 0 })} /></div></label>
      <label><span>Biggest donation date</span><input type="date" value={dateValue(editing.biggestDonationDate)} onChange={(event) => setEditing({ ...editing, biggestDonationDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label><span>Biggest donation amount</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editing.biggestDonationAmount || ''} onChange={(event) => setEditing({ ...editing, biggestDonationAmount: Number(event.target.value) || 0 })} /></div></label>
      <label className="checkbox-label"><input type="checkbox" checked={editing.futurePledge} onChange={(event) => setEditing({ ...editing, futurePledge: event.target.checked })} /> Future pledge</label><label><span>5K amount</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editing.fiveKAmount || ''} onChange={(event) => setEditing({ ...editing, fiveKAmount: Number(event.target.value) || 0 })} /></div></label>
      <h3 className="full fundraising-form-section" id="donor-profile-accounts">Accounts and automatic deductions</h3>
      <label className="checkbox-label"><input type="checkbox" checked={editing.monthlyDonor} onChange={(event) => setEditing({ ...editing, monthlyDonor: event.target.checked })} /> Monthly donor</label><label><span>Donation amount</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editing.autoDeductDonationAmount || ''} onChange={(event) => setEditing({ ...editing, autoDeductDonationAmount: Number(event.target.value) || 0 })} /></div></label>
      <label><span>Billing amount</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editing.autoDeductBillingAmount || ''} onChange={(event) => setEditing({ ...editing, autoDeductBillingAmount: Number(event.target.value) || 0 })} /></div></label><label><span>Pledge amount</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editing.autoDeductPledgeAmount || ''} onChange={(event) => setEditing({ ...editing, autoDeductPledgeAmount: Number(event.target.value) || 0 })} /></div></label>
      <label><span>Pledge start date</span><input type="date" value={dateValue(editing.autoDeductPledgeStart)} onChange={(event) => setEditing({ ...editing, autoDeductPledgeStart: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label><span>Pledge remaining</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editing.autoDeductPledgeRemaining || ''} onChange={(event) => setEditing({ ...editing, autoDeductPledgeRemaining: Number(event.target.value) || 0 })} /></div></label>
      <label><span>Card last four digits only</span><input inputMode="numeric" maxLength={4} value={editing.cardLastFour} onChange={(event) => setEditing({ ...editing, cardLastFour: event.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="1234" /></label><label><span>Card billing ZIP</span><input value={editing.cardBillingZip} onChange={(event) => setEditing({ ...editing, cardBillingZip: event.target.value })} /></label>
      <label className="full"><span>Card billing address</span><textarea rows={2} value={editing.cardBillingAddress} onChange={(event) => setEditing({ ...editing, cardBillingAddress: event.target.value })} /></label><p className="full muted small">For security, store only the last four card digits here. Full card numbers must remain with the payment processor.</p>
      <label id="donor-profile-other"><span>Tags (comma separated)</span><input value={editing.tags.join(', ')} onChange={(event) => setEditing({ ...editing, tags: event.target.value.split(',') })} /></label><label><span>Assigned fundraiser</span><input list="fundraising-admin-name-options" value={editing.assignedTo} onChange={(event) => setEditing({ ...editing, assignedTo: event.target.value })} placeholder="Choose fundraising admin or enter a name" /><small className="muted">Select an admin from the suggestions or type another name.</small></label>
      <section className="full fundraising-donor-picture"><div>{editing.pictureUrl ? <img src={editing.pictureUrl} alt={`${donorName(editing)} donor profile`} /> : <span>No donor picture</span>}</div><label className="secondary-btn"><span>{editing.pictureUrl ? 'Replace donor picture' : 'Upload donor picture'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => { uploadDonorPicture(event.target.files?.[0]); event.target.value = ''; }} /></label>{editing.pictureUrl && <button type="button" className="link-btn danger" onClick={() => setEditing({ ...editing, pictureUrl: '', picturePath: '' })}>Remove picture</button>}</section><label><span>Picture URL</span><input type="url" value={editing.pictureUrl} onChange={(event) => setEditing({ ...editing, pictureUrl: event.target.value, picturePath: '' })} /></label><label><span>Website</span><input type="url" value={editing.websiteUrl} onChange={(event) => setEditing({ ...editing, websiteUrl: event.target.value })} /></label>
      <label><span>Facebook link</span><input type="url" value={editing.facebookUrl} onChange={(event) => setEditing({ ...editing, facebookUrl: event.target.value })} /></label><label><span>LinkedIn link</span><input type="url" value={editing.linkedinUrl} onChange={(event) => setEditing({ ...editing, linkedinUrl: event.target.value })} /></label>
      <label><span>Twitter / X</span><input value={editing.twitterHandle} onChange={(event) => setEditing({ ...editing, twitterHandle: event.target.value })} /></label><label><span>Phone append date</span><input type="date" value={dateValue(editing.phoneAppendDate)} onChange={(event) => setEditing({ ...editing, phoneAppendDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={editing.phoneVerified} onChange={(event) => setEditing({ ...editing, phoneVerified: event.target.checked })} /> Home phone verified</label><label className="checkbox-label"><input type="checkbox" checked={editing.doNotCall} onChange={(event) => setEditing({ ...editing, doNotCall: event.target.checked })} /> Do not call</label>
      <label className="checkbox-label"><input type="checkbox" checked={editing.doNotMail} onChange={(event) => setEditing({ ...editing, doNotMail: event.target.checked })} /> Do not send mail</label><label><span>No-mail reason</span><input value={editing.noMailReason} onChange={(event) => setEditing({ ...editing, noMailReason: event.target.value })} /></label>
      <label><span>Receipt delivery</span><input value={editing.receiptDelivery} onChange={(event) => setEditing({ ...editing, receiptDelivery: event.target.value })} placeholder="Email, letter, or both" /></label><label><span>Receipting preference</span><input value={editing.receiptingPreference} onChange={(event) => setEditing({ ...editing, receiptingPreference: event.target.value })} /></label>
      <label><span>Next follow-up</span><input type="date" value={dateValue(editing.nextFollowUp)} onChange={(event) => setEditing({ ...editing, nextFollowUp: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label className="checkbox-label"><input type="checkbox" checked={editing.archived} onChange={(event) => setEditing({ ...editing, archived: event.target.checked })} /> Archive this donor</label>
      <label className="full"><span>Private stewardship notes</span><textarea rows={5} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
      {editing.id && <section className="full fundraising-call-history" id="donor-profile-contacts"><h3>Fundraising contact history</h3><p className="muted small">Record evidence of donor calls with the call date and notes.</p><div className="fundraising-call-entry"><label><span>Date called</span><input type="date" value={callDate} onChange={(event) => setCallDate(event.target.value)} /></label><label><span>Call notes</span><textarea rows={3} value={callNotes} onChange={(event) => setCallNotes(event.target.value)} /></label><button type="button" className="secondary-btn" disabled={saving || !callDate || !callNotes.trim()} onClick={recordDonorCall}>Record call</button></div><div className="fundraising-call-list">{interactions.filter((item) => item.donorId === editing.id).map((item) => <article key={item.id}><strong>{item.calledAt.toLocaleDateString()}</strong><p>{item.notes}</p><small>Recorded {item.createdAt?.toLocaleString() || 'recently'}</small></article>)}{!interactions.some((item) => item.donorId === editing.id) && <p className="muted small">No calls recorded yet.</p>}</div></section>}
    </div><div className="modal-actions"><button className="secondary-btn" onClick={() => setEditing(null)}>Cancel</button><button className="primary-btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save donor'}</button></div></section></div>}
    {editingPledge && <div className="modal-backdrop"><section className="panel fundraising-donor-editor" role="dialog" aria-modal="true" aria-label="Pledge"><div className="panel-head"><h2>{editingPledge.id ? 'Update pledge' : 'Add pledge'}</h2><button className="link-btn" onClick={() => setEditingPledge(null)}>Close</button></div><div className="fundraising-donor-form">
      {pledgeReviewReasons(editingPledge, displayedPledges, pledgePayments, checkReviewDays).length > 0 && <section className="full pledge-source-note"><strong>Why this pledge needs review</strong>{pledgeReviewReasons(editingPledge, displayedPledges, pledgePayments, checkReviewDays).map((reason) => <p key={reason}>{reason}</p>)}</section>}
      {editingPledge.sourceCampaignEntryId && <div className="full pledge-source-note"><strong>Fundraising dashboard pledge</strong><span>This pledge was entered on the event dashboard. Saving here links its payment tracking without changing the original dashboard entry.</span></div>}
      <label><span>Linked donor record</span><select value={editingPledge.donorId} onChange={(event) => { const donor = donors.find((item) => item.id === event.target.value); setEditingPledge({ ...editingPledge, donorId: event.target.value, donorFirstName: donor?.firstName || editingPledge.donorFirstName, donorLastName: donor?.lastName || editingPledge.donorLastName }); }}><option value="">No linked donor record</option>{donors.filter((donor) => !donor.archived).map((donor) => <option value={donor.id} key={donor.id}>{donorName(donor)}{donor.initiatedName ? ` (${donor.initiatedName})` : ''}</option>)}</select></label>
      <label><span>Event</span><select value={editingPledge.eventId} onChange={(event) => setEditingPledge({ ...editingPledge, eventId: event.target.value })}><option value="">General / no event</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select></label>
      {!editingPledge.donorId && <><label><span>Donor first name *</span><input value={editingPledge.donorFirstName} onChange={(event) => setEditingPledge({ ...editingPledge, donorFirstName: event.target.value })} /></label><label><span>Donor last name</span><input value={editingPledge.donorLastName} onChange={(event) => setEditingPledge({ ...editingPledge, donorLastName: event.target.value })} /></label></>}
      {!editingPledge.eventId && <label className="full"><span>Pledge purpose / event information</span><input value={editingPledge.purpose} onChange={(event) => setEditingPledge({ ...editingPledge, purpose: event.target.value })} placeholder="Describe what this pledge supports" /></label>}
      <label><span>Amount pledged *</span><div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={editingPledge.pledgedAmount || ''} onChange={(event) => setEditingPledge({ ...editingPledge, pledgedAmount: Number(event.target.value) || 0 })} /></div></label>
      <label><span>Amount paid</span><div className="money-input"><span>$</span><input readOnly value={editingPledge.paidAmount} /></div><small className="muted">Updated from payment history</small></label>
      <label><span>Remaining balance</span><div className="money-input"><span>$</span><input readOnly value={Math.max(0, editingPledge.pledgedAmount - editingPledge.paidAmount)} /></div></label>
      {!editingPledge.openBalanceKnown && <div className="full pledge-source-note"><strong>Open balance needs review</strong><span>The source workbook contained {editingPledge.openBalanceSource === 'blank' ? 'a blank balance' : `“${editingPledge.openBalanceSource}” instead of a number`}. Enter received payments as they are verified; the balance will then be tracked from those receipts.</span></div>}
      <label><span>Pledge date</span><input type="date" value={dateValue(editingPledge.pledgeDate)} onChange={(event) => setEditingPledge({ ...editingPledge, pledgeDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label>
      <label><span>Due date</span><input type="date" value={dateValue(editingPledge.dueDate)} onChange={(event) => setEditingPledge({ ...editingPledge, dueDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label>
      <label><span>Payment frequency</span><select value={editingPledge.frequency} onChange={(event) => setEditingPledge({ ...editingPledge, frequency: event.target.value as FundraisingPledge['frequency'] })}><option value="one-time">One-time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label>
      <label><span>Next payment date</span><input type="date" value={dateValue(editingPledge.nextPaymentDate)} onChange={(event) => setEditingPledge({ ...editingPledge, nextPaymentDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label>
      <label><span>Status</span><select disabled={editingPledge.status === 'cancelled'} value={editingPledge.status} onChange={(event) => setEditingPledge({ ...editingPledge, status: event.target.value as FundraisingPledge['status'] })}><option value="active">Active</option><option value="fulfilled">Fulfilled</option><option value="on-hold">On hold</option>{editingPledge.status === 'cancelled' && <option value="cancelled">Cancelled</option>}</select></label>
      {editingPledge.donorId && (() => { const donor = donors.find((item) => item.id === editingPledge.donorId); return donor ? <div className="full pledge-donor-summary"><strong>{donorName(donor)}</strong><span>{[donor.email, donor.phone, donor.address].filter(Boolean).join(' · ') || 'No contact details recorded'}</span><button type="button" className="secondary-btn" onClick={() => { setEditingPledge(null); setEditing({ ...donor }); setView('donors'); }}>Open full donor record</button></div> : null; })()}
      <label className="full"><span>Comments and pledge details</span><textarea rows={7} value={editingPledge.notes} onChange={(event) => setEditingPledge({ ...editingPledge, notes: event.target.value })} placeholder="Record pledge details, payment notes, and follow-up information" /></label>
      {editingPledge.status === 'cancelled' ? <section className="full pledge-cancelled-notice"><strong>Cancelled pledge</strong><span>{editingPledge.cancellationReason}</span><small>Cancelled {editingPledge.cancelledAt?.toLocaleString() || 'previously'}. Original amounts and payment history are retained for audit.</small></section> : editingPledge.id && !editingPledge.id.startsWith('dashboard:') ? <section className="full pledge-cancel-control"><h3>Cancel pledge</h3><p className="muted small">This voids the pledge from active totals without deleting its record or payment history.</p><label><span>Cancellation reason *</span><textarea rows={2} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Explain why the pledge is being cancelled" /></label><button type="button" className="danger-btn" disabled={saving || !cancellationReason.trim()} onClick={cancelPledge}>Cancel pledge and void amount</button></section> : null}
      <section className="full pledge-payment-history"><div><h3>Payment history</h3><p className="muted small">Record when pledge money was received, its payment mode, and supporting details.</p></div>
        {editingPledge.status === 'cancelled' ? <><div className="pledge-source-note"><span>This pledge is cancelled. Existing receipts remain visible, but new payments cannot be added.</span></div><div className="pledge-payment-list">{pledgePayments.filter((payment) => payment.pledgeId === editingPledge.id).map((payment) => <article key={payment.id}><div><strong>{money.format(payment.amount)}</strong><span>Received {payment.receivedAt.toLocaleDateString()} · {payment.method.replace('-', ' ')}</span><span>Status: {payment.status}</span></div><div><b>{payment.reference || payment.receiptNumber || 'No reference'}</b><p>{payment.comments || 'No additional comments'}</p></div></article>)}{!pledgePayments.some((payment) => payment.pledgeId === editingPledge.id) && <p className="muted small">No received payments were recorded.</p>}</div></> : editingPledge.id.startsWith('dashboard:') || !editingPledge.id ? <div className="pledge-source-note"><span>Save and link this pledge first. Then reopen it to record received payments.</span></div> : <>
          <div className="pledge-payment-entry">
            <label><span>Date received *</span><input type="date" max={dateValue(new Date())} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
            <label><span>Amount received *</span><div className="money-input"><span>$</span><input type="number" min="0.01" max={Math.max(0, editingPledge.pledgedAmount - editingPledge.paidAmount)} step="0.01" value={paymentAmount || ''} onChange={(event) => setPaymentAmount(Number(event.target.value) || 0)} /></div></label>
            <label><span>Payment mode *</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PledgePaymentMethod)}><option value="zelle">Zelle</option><option value="check">Check</option><option value="cash">Cash</option><option value="card">Credit/debit card</option><option value="bank-transfer">Bank transfer</option><option value="other">Other</option></select></label>
            <label><span>Payment status</span><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PledgePaymentStatus)}><option value="received">Received</option><option value="deposited">Deposited</option><option value="cleared">Cleared</option></select></label>
            <label><span>Reference / check number</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Transaction ID, check number, etc." /></label>
            <label><span>Received by</span><input list="fundraising-admin-name-options" value={paymentReceivedBy} onChange={(event) => setPaymentReceivedBy(event.target.value)} placeholder="Choose fundraising admin or enter a name" /><small className="muted">Select an admin from the suggestions or type another name.</small></label>
            <label><span>Deposited / processed date</span><input type="date" value={paymentDepositedDate} onChange={(event) => setPaymentDepositedDate(event.target.value)} /></label>
            <label><span>Receipt number</span><input value={paymentReceiptNumber} onChange={(event) => setPaymentReceiptNumber(event.target.value)} /></label>
            <label className="full"><span>Fund / designation</span><input value={paymentDesignation} onChange={(event) => setPaymentDesignation(event.target.value)} placeholder="General fund, building fund, event, deity seva, etc." /></label>
            <label className="full"><span>Payment comments and other details</span><textarea rows={3} value={paymentComments} onChange={(event) => setPaymentComments(event.target.value)} placeholder="Add Zelle sender, cash receipt details, restrictions, or other notes" /></label>
            <button type="button" className="primary-btn" disabled={saving || paymentAmount <= 0 || !paymentDate} onClick={recordPledgePayment}>Record received payment</button>
          </div>
          <div className="pledge-payment-list">{pledgePayments.filter((payment) => payment.pledgeId === editingPledge.id).map((payment) => <article key={payment.id}><div><strong>{money.format(payment.amount)}</strong><span>Received {payment.receivedAt.toLocaleDateString()} · {payment.method.replace('-', ' ')}</span><span>Status: {payment.status}{payment.depositedAt ? ` · Processed ${payment.depositedAt.toLocaleDateString()}` : ''}</span></div><div><b>{payment.reference || payment.receiptNumber || 'No reference'}</b><p>{[payment.receivedBy ? `Received by ${payment.receivedBy}` : '', payment.receiptNumber ? `Receipt ${payment.receiptNumber}` : '', payment.designation ? `For ${payment.designation}` : ''].filter(Boolean).join(' · ')}</p><p>{payment.comments || 'No additional comments'}</p></div></article>)}{!pledgePayments.some((payment) => payment.pledgeId === editingPledge.id) && <p className="muted small">No received payments have been recorded yet.</p>}</div>
        </>}
      </section>
    </div><div className="modal-actions"><button className="secondary-btn" onClick={() => setEditingPledge(null)}>Close</button>{editingPledge.status !== 'cancelled' && <button className="primary-btn" disabled={saving} onClick={savePledge}>{saving ? 'Saving…' : 'Save pledge'}</button>}</div></section></div>}
  </div>;
};

export default FundraisingCrm;
