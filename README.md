# ISKCON Towaco Volunteer Management System

A zero-cost volunteer coordination app for a temple/nonprofit. Admins create
**tasks** and assign volunteers; volunteers can register themselves and sign up
for open tasks. The app sends **automated reminders** over WhatsApp, email, and
web push, scheduled entirely by **GitHub Actions** (no server, no credit card).

## What it does

**Admins can**
- Add / edit / remove volunteers (and bulk import/export via CSV)
- Create tasks: title, description, date/time, location, skills needed,
  number of volunteers needed, recurrence (daily/weekly/monthly)
- Use AI Create to turn a plain-language event description into an editable
  event and task plan
- Assign volunteers to tasks or open tasks for self sign-up
- Change task status (open / filled / in progress / completed / cancelled)
- Send announcements to all volunteers or a skill-filtered group
- View reports: total hours served, upcoming and understaffed tasks

**Volunteers can**
- Self-register (name, email, phone captured)
- Browse and sign up for open tasks (capacity-enforced)
- See their assigned tasks and withdraw
- Check in / check out to log volunteer hours
- Edit their profile: skills, weekly availability, and reminder preferences
- Enable browser push notifications

**Automated reminders**
- A scheduled GitHub Actions job runs every 15 minutes, finds tasks whose
  reminder time is due, and messages each assigned volunteer on their chosen
  channels. Recurring tasks automatically spawn their next occurrence.

**AI Create**
- An admin can describe an event in plain language, including dates, times,
  tasks, skills, and volunteer counts.
- Google Gemini converts the request into a structured event and task plan.
- The app always presents an editable preview before saving anything to
  Firestore.
- Gemini is called through a Cloudflare Worker, so the API key remains an
  encrypted server-side secret and is never included in the public React app.

## Cost

| Piece | Cost |
| --- | --- |
| Hosting (GitHub Pages) | Free |
| Database + Auth (Firebase free tier) | Free |
| Scheduler (GitHub Actions) | Free |
| Email (Resend free tier) | Free |
| Web push (Firebase Cloud Messaging) | Free |
| AI proxy (Cloudflare Workers free tier) | Free within Cloudflare's limits |
| AI generation (Gemini) | Subject to the selected Gemini plan and quota |
| WhatsApp (Meta Cloud API) | Meta's per-conversation fee only |

Everything except WhatsApp messages is free. WhatsApp uses your existing Meta
WhatsApp Business number; Meta charges per conversation for business-initiated
template messages.

## Architecture

```
React app (GitHub Pages)  ──►  Firebase Auth + Firestore (free tier)
                                     ▲
                                     │ reads tasks/volunteers/announcements
GitHub Actions cron ── reminder-sender/ (firebase-admin) ──► WhatsApp / Email / Push
```

- `src/` — the React + TypeScript app (the only frontend)
- `reminder-sender/` — Node script run by GitHub Actions to send reminders
- `firestore.rules` — access control (admins vs volunteers)
- `.github/workflows/pages.yml` — builds & deploys the app to GitHub Pages
- `.github/workflows/reminders.yml` — the scheduled reminder sender

## Quick start

1. Create a Firebase project (Auth: Email/Password enabled; Firestore enabled).
2. Copy `.env.example` to `.env` and fill in the `REACT_APP_FIREBASE_*` values.
3. `npm install && npm start` to run locally.
4. Deploy: push to `main` (GitHub Pages workflow builds and publishes).
5. Configure secrets for reminders — see [SETUP.md](./SETUP.md).

## First admin

Admin access is granted only by an `admins/{uid}` document with `isAdmin: true`
— there are no hardcoded admin logins. After the first volunteer signs up,
create that document for their UID in the Firestore console (or use the
first-admin claim helper). See [SETUP.md](./SETUP.md).

## AI Create setup

The deployed app uses a Cloudflare Worker as a secure Gemini proxy. Configure:

- Cloudflare Worker secret `GEMINI_API_KEY`: a Gemini API key created in
  Google AI Studio
- Cloudflare Worker variable `ALLOWED_ORIGIN`: the public app origin, currently
  `https://arraina.github.io`
- GitHub Actions repository variable `REACT_APP_AI_ENDPOINT`: the deployed
  Worker URL

The Worker source and deployment settings are in `ai-proxy/worker.js` and
`ai-proxy/wrangler.jsonc`. See [SETUP.md](./SETUP.md) for complete deployment
instructions.
