import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { FundraisingCampaign } from './store';

interface CreatedShareLink {
  token: string;
  expiresAtMillis: number;
}

interface SharedDashboardResult {
  campaign: FundraisingCampaign;
  expiresAtMillis: number;
}

function fundraisingShareUrl(token: string): string {
  const base = window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : '';
  return `${window.location.origin}${base}/?fundraisingToken=${encodeURIComponent(token)}`;
}

async function copyText(url: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const input = document.createElement('textarea');
  input.value = url;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export async function createAndCopyFundraisingShareUrl(eventId: string): Promise<number> {
  const createLink = httpsCallable<{ eventId: string }, CreatedShareLink>(functions, 'createFundraisingShareLink');
  const result = await createLink({ eventId });
  await copyText(fundraisingShareUrl(result.data.token));
  return result.data.expiresAtMillis;
}

export async function getSharedFundraisingDashboard(token: string): Promise<SharedDashboardResult> {
  const getDashboard = httpsCallable<{ token: string }, SharedDashboardResult>(functions, 'getSharedFundraisingDashboard');
  const result = await getDashboard({ token });
  return result.data;
}
