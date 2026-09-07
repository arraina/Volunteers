// Cloudflare Worker: a tiny proxy that keeps your Gemini API key server-side.
// The React app POSTs { prompt, system } here; the Worker calls Gemini with the
// secret key and returns { text }.
//
// Deploy (free):
//   1. Create a Cloudflare account (free).
//   2. Workers & Pages -> Create -> paste this file.
//   3. Settings -> Variables -> add secret GEMINI_API_KEY (your Gemini key).
//   4. Optional: set ALLOWED_ORIGIN to your app's URL to lock down CORS.
//   5. Copy the Worker URL into the app env as REACT_APP_AI_ENDPOINT.

const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const MAX_BODY_BYTES = 16 * 1024;

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const requestOrigin = request.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };

    if (allowedOrigin !== '*' && requestOrigin !== allowedOrigin) {
      return json({ error: 'Origin not allowed.' }, 403, cors);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured on the Worker.' }, 500, cors);
    }
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: 'Request body is too large.' }, 413, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400, cors);
    }

    const prompt = String(body.prompt || '').slice(0, 4000);
    const system = String(body.system || '').slice(0, 8000);
    if (!prompt) return json({ error: 'Missing prompt.' }, 400, cors);

    const payload = JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    });
    let lastError = 'Gemini request failed.';

    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const geminiRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          body: payload,
        });

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return json({ text }, 200, cors);
        }

        const err = await geminiRes.json().catch(() => ({}));
        lastError = err?.error?.message || lastError;
        if ((geminiRes.status === 429 || geminiRes.status === 503) && attempt < 2) {
          await delay(800 * (attempt + 1));
          continue;
        }
        break;
      }
    }

    return json({ error: lastError }, 502, cors);
  },
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
