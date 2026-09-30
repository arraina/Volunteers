export function fundraisingShareUrl(eventId: string): string {
  const base = window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : '';
  // Enter through the Pages root so GitHub returns HTTP 200. Direct SPA paths
  // are served through its 404 fallback and can render as a blank page in some
  // mobile/in-app browsers.
  return `${window.location.origin}${base}/?fundraising=${encodeURIComponent(eventId)}`;
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
