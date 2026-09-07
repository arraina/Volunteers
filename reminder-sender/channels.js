// Pluggable notification channels. Each returns { ok, id?, error? }.
// Secrets come from environment variables (set as GitHub Actions secrets).

const GRAPH_VERSION = 'v21.0';

/**
 * Send a WhatsApp template message via the Meta WhatsApp Cloud API.
 * Requires WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME.
 *
 * Automated (business-initiated) reminders MUST use an approved template.
 * Body variable count must match your approved template's {{1}}..{{n}}.
 */
export async function sendWhatsApp({ to, templateParams }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

  if (!token || !phoneNumberId || !templateName) {
    return { ok: false, error: 'WhatsApp env not configured' };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: normalizePhone(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: (templateParams || []).map((text) => ({ type: 'text', text: String(text) })),
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Send an email via Resend (https://resend.com) free tier.
 * Requires EMAIL_API_KEY (Resend key) and EMAIL_FROM (verified sender).
 */
export async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: 'Email env not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Send a web-push notification via Firebase Cloud Messaging (admin SDK).
 * `messaging` is the admin.messaging() instance. `tokens` is an array of
 * device tokens. Free.
 */
export async function sendPush(messaging, { tokens, title, body }) {
  const validTokens = (tokens || []).filter(Boolean);
  if (validTokens.length === 0) {
    return { ok: false, error: 'No push tokens' };
  }
  try {
    const resp = await messaging.sendEachForMulticast({
      tokens: validTokens,
      notification: { title, body },
    });
    return { ok: resp.successCount > 0, id: `${resp.successCount}/${validTokens.length}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Meta expects E.164 without a leading '+'.
function normalizePhone(phone) {
  return String(phone).replace(/[^\d]/g, '');
}
