# Setup Guide

This walks through deploying the temple volunteer app at zero hosting cost and
turning on automated reminders.

## 1. Firebase (free tier)

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method →** enable **Email/Password**.
3. **Firestore Database →** create a database (production mode).
4. **Project Settings → General → Your apps →** add a **Web app**, copy the
   config values into `.env` (from `.env.example`):
   - `REACT_APP_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`,
     `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID`
5. Deploy the Firestore security rules:
   ```bash
   npx firebase deploy --only firestore:rules
   ```

## 2. Deploy the app to GitHub Pages (free)

1. In your GitHub repo: **Settings → Pages → Build and deployment → GitHub
   Actions**.
2. Add the Firebase web config as **repository variables** (Settings → Secrets
   and variables → Actions → **Variables**), matching the names in
   `.github/workflows/pages.yml` (`REACT_APP_FIREBASE_*`, and
   `REACT_APP_FIREBASE_VAPID_KEY` if using web push).
3. Push to `main`. The **Deploy React App to GitHub Pages** workflow builds and
   publishes automatically.

## 3. First admin

Admin is granted only by a Firestore doc — no hardcoded logins.

1. Have your admin sign up in the app (creates their auth account + volunteer
   profile).
2. In the Firestore console, find their UID (Authentication tab), then create:
   ```
   Collection: admins
   Document ID: <that UID>
   Fields: isAdmin (boolean) = true
   ```
3. Also create `adminsMeta/count` with `total: 1` so the self-claim path stays
   closed.
4. Log out and back in — they'll land on the admin dashboard.

## 4. WhatsApp reminders (Meta Cloud API)

You send directly through Meta using the same number your WhatsApp CRM uses.

**Get a permanent access token**
1. <https://business.facebook.com> → **Business Settings → Users → System
   Users** → add a system user (Admin).
2. **Add Assets →** assign your WhatsApp Account (WABA) with full control.
3. **Generate New Token →** select your app, expiration **Never**, permissions
   `whatsapp_business_messaging` + `whatsapp_business_management`. Copy it now
   (shown once).

**Get the phone number ID**
- **developers.facebook.com →** your app → **WhatsApp → API Setup →** copy the
  **Phone number ID**.

**Create an approved reminder template**
- In your WhatsApp CRM or Meta, create a template (category: Utility) with 4
  body variables, e.g.:
  > Hi {{1}}, reminder: {{2}} on {{3}} at {{4}}.
- Note its **name** and **language code** (e.g. `en_US`).

## 5. Email reminders (Resend free tier — optional)

1. Create an account at <https://resend.com>, verify a sender domain/address.
2. Create an API key.

## 6. Web push (Firebase Cloud Messaging — free, optional)

1. **Firebase → Project Settings → Cloud Messaging → Web Push certificates →**
   generate a key pair. Put the public key in `REACT_APP_FIREBASE_VAPID_KEY`.
2. Edit `public/firebase-messaging-sw.js` and replace the `REPLACE_*`
   placeholders with your public Firebase web config (service workers can't read
   env vars at runtime).

## 7. Reminder sender secrets (GitHub Actions)

The scheduled job needs a **Firebase service account** and your channel
credentials. Add these as **repository secrets** (Settings → Secrets and
variables → Actions → **Secrets**):

| Secret | Value |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON of a Firebase service account key (Project Settings → Service accounts → Generate new private key) |
| `WHATSAPP_ACCESS_TOKEN` | Permanent Meta system-user token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number ID |
| `WHATSAPP_TEMPLATE_NAME` | Approved template name (e.g. `task_reminder`) |
| `WHATSAPP_TEMPLATE_LANG` | Template language (e.g. `en_US`) |
| `EMAIL_API_KEY` | Resend API key (optional) |
| `EMAIL_FROM` | Verified from address (optional) |

The **Send Volunteer Reminders** workflow runs every 15 minutes. You can also
run it manually from the Actions tab (workflow_dispatch) to test.

### Security notes

- Never commit tokens. They live only in GitHub secrets and are injected at run
  time. The Firebase **web** config (`REACT_APP_*`) is public and safe to expose.
- The reminder sender uses admin credentials and runs server-side only.
- Reminders are idempotent: a `remindersSent` marker prevents double-sending.

## 8. AI Create (natural-language event/task creation — Google Gemini)

Lets an admin type "Create Janmashtami on Aug 26 evening with tasks: pot washing
4 people, parking 6, stalls 3" and get an editable event + task plan to confirm.

**Get a free Gemini key**
1. <https://aistudio.google.com/app/apikey> → create an API key (free tier).

**Recommended: keep the key server-side with a free Cloudflare Worker**
1. Create a Cloudflare account → Workers & Pages → Create Worker.
2. Paste `ai-proxy/worker.js` from this repo.
3. Worker → Settings → Variables → add secret `GEMINI_API_KEY`. Optionally set
   `ALLOWED_ORIGIN` to your app URL.
4. Deploy, copy the Worker URL into `REACT_APP_AI_ENDPOINT` in `.env` (and as a
   GitHub Pages repo variable for the deployed build).

**Fallback (quicker, less secure): call Gemini directly**
- Put the key in `REACT_APP_GEMINI_API_KEY`. It ships in the built app, so
  restrict it in Google Cloud console by **HTTP referrer** to your app's domain.
- Optionally set `REACT_APP_GEMINI_MODEL` (default `gemini-1.5-flash`).

The admin **AI Create** tab always shows a preview to edit before anything is
created — a bad parse never silently creates data. If neither env value is set,
the tab explains it's not configured and manual creation still works.

## Local development

```bash
npm install
npm start          # http://localhost:3000

# test the reminder sender locally (needs the env vars above exported):
cd reminder-sender && npm install && npm run send
```
