// AI "vibe create" helper: turns a free-text admin request into a structured
// event + task list using Google Gemini.
//
// Two ways to call Gemini (configured via env):
//  1. Proxy (recommended): set REACT_APP_AI_ENDPOINT to your Cloudflare Worker
//     URL. The Worker holds the Gemini key server-side. The app POSTs { prompt }.
//  2. Direct: set REACT_APP_GEMINI_API_KEY (a referrer-restricted key). The app
//     calls Gemini's REST API directly. Less secure — the key ships in the app.
//
// The app always shows a preview for the admin to edit before anything is
// created, so a bad parse never silently creates wrong data.

export interface ParsedTask {
  title: string;
  volunteersNeeded: number;
  skills: string[];
  /** Free-text time hint like "evening" or "2pm"; admin refines in preview. */
  timeHint?: string;
}

export interface ParsedEventPlan {
  event: { name: string; dateHint?: string };
  tasks: ParsedTask[];
}

export type TaskManagementAction =
  | {
      type: 'update_task';
      taskId: string;
      changes: {
        title?: string;
        description?: string;
        startDateTime?: string;
        endDateTime?: string | null;
        location?: string;
        volunteersNeeded?: number;
        openForSignup?: boolean;
        reminderHoursBefore?: number[];
      };
    }
  | { type: 'assign_volunteer'; taskId: string; volunteerId: string }
  | { type: 'remove_volunteer'; taskId: string; volunteerId: string }
  | { type: 'set_cancelled'; taskId: string; cancelled: boolean };

export interface TaskManagementPlan {
  summary: string;
  actions: TaskManagementAction[];
}

const PROXY_ENDPOINT = process.env.REACT_APP_AI_ENDPOINT || '';
const GEMINI_KEY = process.env.REACT_APP_GEMINI_API_KEY || '';
// `gemini-flash-latest` always resolves to the current fast Flash model, so the
// default won't break when Google retires specific dated versions.
const GEMINI_MODEL = process.env.REACT_APP_GEMINI_MODEL || 'gemini-flash-latest';

export const isAiConfigured = Boolean(PROXY_ENDPOINT || GEMINI_KEY);

const SYSTEM_INSTRUCTION = `You convert a temple volunteer coordinator's plain-language request into structured JSON.
Return ONLY valid minified JSON, no markdown, matching exactly:
{"event":{"name":string,"dateHint":string?},"tasks":[{"title":string,"volunteersNeeded":number,"skills":string[],"timeHint":string?}]}
Rules:
- Infer sensible task titles (e.g. "pot washing", "parking", "stalls").
- volunteersNeeded: use the number the user gives, else default 2.
- skills: choose zero or more from exactly this list when clearly relevant:
  ["Kitchen / Prasadam","Cleaning","Decoration / Flowers","Sound / AV","Setup / Teardown","Greeting / Hospitality","Teaching / Childcare","Parking / Security","Fundraising","General"].
- dateHint and timeHint: copy any date/time words the user gave; do not invent specifics.
- If no event name is given, use a short sensible name.`;

function extractJson(text: string): any {
  // Models sometimes wrap JSON in prose or code fences; grab the first {...}.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI did not return JSON.');
  return JSON.parse(candidate.slice(start, end + 1));
}

function validatePlan(raw: any): ParsedEventPlan {
  if (!raw || typeof raw !== 'object' || !raw.event || !Array.isArray(raw.tasks)) {
    throw new Error('AI response was not in the expected shape.');
  }
  const tasks: ParsedTask[] = raw.tasks
    .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
    .map((t: any) => ({
      title: String(t.title).trim(),
      volunteersNeeded:
        Number.isFinite(t.volunteersNeeded) && t.volunteersNeeded > 0
          ? Math.floor(t.volunteersNeeded)
          : 2,
      skills: Array.isArray(t.skills) ? t.skills.filter((s: any) => typeof s === 'string') : [],
      timeHint: typeof t.timeHint === 'string' ? t.timeHint : undefined,
    }));
  if (tasks.length === 0) throw new Error('The AI could not identify any tasks. Try rephrasing.');
  return {
    event: {
      name: String(raw.event.name || 'Untitled Event').trim(),
      dateHint: typeof raw.event.dateHint === 'string' ? raw.event.dateHint : undefined,
    },
    tasks,
  };
}

async function callProxy(prompt: string, system = SYSTEM_INSTRUCTION): Promise<string> {
  const res = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system }),
  });
  if (!res.ok) throw new Error(`AI proxy error (HTTP ${res.status}).`);
  const data = await res.json();
  // Accept either { text } from our worker, or a raw Gemini response.
  if (typeof data.text === 'string') return data.text;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// A "busy" error we should retry / fall back on (rate limit or overloaded).
class RetryableAiError extends Error {}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGeminiDirect(prompt: string, model: string, system = SYSTEM_INSTRUCTION): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message || `Gemini error (HTTP ${res.status}).`;
    // 429 = rate limited, 503 = overloaded/high demand — worth retrying.
    if (res.status === 429 || res.status === 503) throw new RetryableAiError(message);
    throw new Error(message);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Try the primary model with a couple of retries, then fall back to a lighter
// model, both of which are on the free tier. Handles Gemini's "high demand"
// (503) and rate-limit (429) responses gracefully.
async function generateWithResilience(prompt: string, system = SYSTEM_INSTRUCTION): Promise<string> {
  if (PROXY_ENDPOINT) return callProxy(prompt, system);

  const models = [GEMINI_MODEL, 'gemini-flash-lite-latest'].filter(
    (m, i, arr) => arr.indexOf(m) === i
  );
  let lastError: Error | null = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callGeminiDirect(prompt, model, system);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof RetryableAiError && attempt < 2) {
          await delay(800 * (attempt + 1)); // 0.8s, 1.6s backoff
          continue;
        }
        break; // non-retryable, or out of retries -> try next model
      }
    }
  }
  throw new Error(
    lastError?.message ||
      'The AI is busy right now. Please try again in a moment.'
  );
}

/** Parse a free-text request into an editable event + task plan. */
export async function parseEventRequest(text: string): Promise<ParsedEventPlan> {
  if (!isAiConfigured) {
    throw new Error(
      'AI create is not configured. Set REACT_APP_AI_ENDPOINT (proxy) or REACT_APP_GEMINI_API_KEY.'
    );
  }
  const raw = await generateWithResilience(text);
  return validatePlan(extractJson(raw));
}

/** Convert a management request into validated actions against known record IDs. */
export async function parseTaskManagementRequest(
  text: string,
  tasks: Array<{ id: string; title: string; startDateTime: Date; eventName?: string }>,
  volunteers: Array<{ uid: string; name: string; email?: string }>
): Promise<TaskManagementPlan> {
  if (!isAiConfigured) throw new Error('AI task management is not configured.');
  const taskCatalog = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    date: t.startDateTime.toISOString(),
    event: t.eventName || '',
  }));
  const requestLower = text.toLowerCase();
  // Email addresses are resolved locally. Only an email explicitly typed by the
  // admin is echoed to the AI; the rest of the volunteer directory stays name-only.
  const volunteerCatalog = volunteers.map((v) => ({
    id: v.uid,
    name: v.name,
    ...(v.email && requestLower.includes(v.email.toLowerCase()) ? { email: v.email } : {}),
  }));
  const resolvedEmailMatches = volunteers
    .filter((v) => v.email && requestLower.includes(v.email.toLowerCase()))
    .map((v) => ({ email: v.email, id: v.uid, name: v.name }));
  const system = `You translate an administrator request into safe task-management actions.
Return ONLY valid minified JSON matching {"summary":string,"actions":Action[]}.
Action is one of:
{"type":"update_task","taskId":string,"changes":{"title"?:string,"description"?:string,"startDateTime"?:ISO-8601 string,"endDateTime"?:ISO-8601 string|null,"location"?:string,"volunteersNeeded"?:positive integer,"openForSignup"?:boolean,"reminderHoursBefore"?:positive number[]}}
{"type":"assign_volunteer"|"remove_volunteer","taskId":string,"volunteerId":string}
{"type":"set_cancelled","taskId":string,"cancelled":boolean}
Use only IDs present in the supplied catalogs. Match names, email addresses, event, and dates carefully. Resolve relative dates such as "next Sunday" from CURRENT DATE/TIME in the administrator's time zone. Never invent IDs. If the request is ambiguous, return an empty actions array and explain what needs clarification in summary. Do not create or delete records.`;
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const prompt = `CURRENT DATE/TIME: ${now.toISOString()} (${now.toLocaleString()} in ${timeZone})\nREQUEST:\n${text}\n\nEXACT EMAIL MATCHES:\n${JSON.stringify(resolvedEmailMatches)}\n\nTASKS:\n${JSON.stringify(taskCatalog)}\n\nVOLUNTEERS:\n${JSON.stringify(volunteerCatalog)}`;
  const raw = extractJson(await generateWithResilience(prompt, system));
  if (!raw || !Array.isArray(raw.actions)) throw new Error('AI response was not a management plan.');
  const taskIds = new Set(tasks.map((t) => t.id));
  const volunteerIds = new Set(volunteers.map((v) => v.uid));
  const actions = raw.actions.filter((action: any) => {
    if (!action || !taskIds.has(action.taskId)) return false;
    if (action.type === 'update_task') return action.changes && typeof action.changes === 'object';
    if (action.type === 'set_cancelled') return typeof action.cancelled === 'boolean';
    if (action.type === 'assign_volunteer' || action.type === 'remove_volunteer') {
      return volunteerIds.has(action.volunteerId);
    }
    return false;
  }) as TaskManagementAction[];
  return { summary: String(raw.summary || 'Review the proposed changes.'), actions };
}
