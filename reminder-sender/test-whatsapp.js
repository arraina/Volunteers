// Local WhatsApp test harness. Sends a single message via the Meta WhatsApp
// Cloud API so you can confirm your credentials work before wiring up the
// scheduled reminder job.
//
// Credentials are read from environment variables — nothing is stored on disk.
//
// USAGE (from the reminder-sender/ folder):
//
//   export WHATSAPP_ACCESS_TOKEN="EAAG...your token..."
//   export WHATSAPP_PHONE_NUMBER_ID="123456789012345"
//
//   # 1) Connectivity test with Meta's pre-approved hello_world template:
//   node test-whatsapp.js hello +15551234567
//
//   # 2) Your real reminder template (4 body variables):
//   export WHATSAPP_TEMPLATE_NAME="task_reminder"
//   export WHATSAPP_TEMPLATE_LANG="en_US"
//   node test-whatsapp.js reminder +15551234567
//
// The recipient must have opted in / messaged your business number, or be on
// your Meta test-recipient list.

const GRAPH_VERSION = 'v21.0';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function normalizePhone(phone) {
  return String(phone).replace(/[^\d]/g, '');
}

async function main() {
  const mode = process.argv[2] || 'hello';
  const recipient = process.argv[3];

  if (!recipient) {
    console.error('Usage: node test-whatsapp.js <hello|reminder> <recipient-phone>');
    console.error('Example: node test-whatsapp.js hello +15551234567');
    process.exit(1);
  }

  const token = requireEnv('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const to = normalizePhone(recipient);

  let template;
  if (mode === 'hello') {
    template = { name: 'hello_world', language: { code: 'en_US' } };
    console.log('Sending pre-approved hello_world template…');
  } else if (mode === 'reminder') {
    const name = requireEnv('WHATSAPP_TEMPLATE_NAME');
    const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';
    // Sample values that match the app's 4 reminder variables.
    template = {
      name,
      language: { code: lang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ravi' },
            { type: 'text', text: 'Kitchen Seva' },
            { type: 'text', text: 'Sun, Sep 14, 5:00 PM' },
            { type: 'text', text: 'Temple Kitchen' },
          ],
        },
      ],
    };
    console.log(`Sending your "${name}" (${lang}) template with sample reminder values…`);
  } else {
    console.error('First argument must be "hello" or "reminder".');
    process.exit(1);
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (res.ok) {
    console.log('\n✅ Sent! Check WhatsApp on', recipient);
    console.log('Message id:', data?.messages?.[0]?.id);
  } else {
    console.error('\n❌ Failed (HTTP', res.status + '):');
    console.error(JSON.stringify(data?.error || data, null, 2));
    console.error('\nCommon causes:');
    console.error(' - Token expired or wrong (use a fresh one from API Setup)');
    console.error(' - Recipient not opted in / not on your test recipient list');
    console.error(' - Template name/language mismatch or not yet approved');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
