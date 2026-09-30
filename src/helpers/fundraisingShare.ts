export function fundraisingShareUrl(eventId: string): string {
  const base = window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : '';
  return `${window.location.origin}${base}/fundraising/${encodeURIComponent(eventId)}`;
}

export async function copyFundraisingShareUrl(eventId: string): Promise<void> {
  const url = fundraisingShareUrl(eventId);
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
