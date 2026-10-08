const COLLECTIONS = new Set(['fundraisingCuratedDonors', 'fundraisingPledges', 'fundraisingPledgePayments', 'fundraisingCampaigns', 'fundraisingDonorInteractions', 'fundraisingShareLinks', 'fundraisingPledgeFollowUps']);

function safeSnapshot(collection, data) {
  if (!data) return null;
  if (collection === 'fundraisingShareLinks') return Object.fromEntries(['eventId', 'expiresAt', 'createdBy', 'createdAt'].filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
  return data;
}

function changes(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter((key) => !['updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'correctionRevisionId'].includes(key))
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

function financialValues(collection, data) {
  if (!data) return null;
  if (collection === 'fundraisingPledges') return {
    originalPledged: data.pledgedAmount || 0,
    paid: data.openBalanceKnown === false ? null : data.paidAmount || 0,
    activePledged: data.status === 'cancelled' ? 0 : data.pledgedAmount || 0,
    remaining: data.status === 'cancelled' ? 0 : data.openBalanceKnown === false ? null : Math.max(0, (data.pledgedAmount || 0) - (data.paidAmount || 0)),
  };
  if (collection === 'fundraisingPledgePayments') return { received: data.amount || 0 };
  if (collection === 'fundraisingCampaigns') {
    const result = { target: data.targetAmount || 0, startingAmount: data.startingCurrentAmount || 0, donation: 0, pledge: 0, loan: 0 };
    (data.entries || []).forEach((entry) => { if (['donation', 'pledge', 'loan'].includes(entry.type)) result[entry.type] += Number(entry.amount) || 0; });
    return result;
  }
  if (collection === 'fundraisingCuratedDonors') return Object.fromEntries(['lastDonationAmount', 'biggestDonationAmount', 'autoDeductDonationAmount', 'autoDeductBillingAmount', 'autoDeductPledgeAmount', 'autoDeductPledgeRemaining', 'futurePledge', 'fiveKAmount'].map((key) => [key, data[key] ?? null]));
  return null;
}

function lineage(data) {
  return Object.fromEntries(['donorId', 'pledgeId', 'eventId', 'sourceCampaignEntryId', 'sourceImportKey', 'openBalanceSource', 'purpose', 'designation', 'assignedTo'].filter((key) => data?.[key] != null).map((key) => [key, data[key]]));
}

module.exports = { COLLECTIONS, changes, financialValues, lineage, safeSnapshot };
