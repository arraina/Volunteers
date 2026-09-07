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

const GEMINI_MODEL = 'gemini-flash-latest';

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured on the Worker.' }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400, cors);
    }

    const prompt = String(body.prompt || '').slice(0, 4000);
    const system = String(body.system || '');
    if (!prompt) return json({ error: 'Missing prompt.' }, 400, cors);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return json({ error: err?.error?.message || 'Gemini request failed.' }, 502, cors);
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return json({ text }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
