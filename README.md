# Volunteer Management App

Simple nonprofit volunteer management app using Firebase Auth, Firestore, Hosting, Cloud Functions, and Twilio SMS reminders.

## Folder Structure

```text
/
  firebase.json
  firestore.rules
  package.json
  public/
    index.html
  src/
    App.tsx
    config/firebase.ts
    helpers/types.ts
    pages/Auth.tsx
    pages/AdminDashboard.tsx
    pages/VolunteerDashboard.tsx
  functions/
    package.json
    tsconfig.json
    src/index.ts
```

## What Is Done

- Firebase Auth login/signup flow for volunteers.
- Admin dashboard for service events, volunteer creation, volunteer assignment, event status updates, and reminder setup.
- Volunteer dashboard for editing the current user's profile and viewing assigned read-only events.
- Firestore security rules:
  - Admins can read/write admin-managed app records.
  - Volunteers can read/update only their own profile fields.
  - Volunteers can read only assigned service events.
  - Reminder and sent-message writes are blocked from frontend clients.
- Scheduled Cloud Function runs every minute, sends due pending reminders through Twilio, and writes delivery results to `sentMessages`.
- Callable Cloud Functions let admins create volunteers and generate reminder documents without exposing Twilio credentials in the frontend.
- Firebase Hosting now points to the React production build output.

## What Still Needs Your Real Project Values

- Replace the placeholder Firebase web config values in `src/config/firebase.ts`, or create a local `.env` using the keys from `.env.example`.
- Create the first admin document manually:

```text
admins/{uid}
  isAdmin: true
```

- Install dependencies before building or deploying.
- Configure an actual Firebase project in `.firebaserc`.
- Add a Firestore composite index if the console asks for one for the reminders query on `status` and `reminderTime`.

## Twilio Configuration

The function reads Twilio credentials from environment variables first:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_PHONE_NUMBER
```

It also supports the legacy config style you asked for:

```bash
firebase functions:config:set \
  twilio.account_sid="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  twilio.auth_token="your_auth_token" \
  twilio.phone_number="+15551234567"
```

Never put Twilio credentials in `src/` or any frontend `.env` file.

## Run Locally

```bash
npm install
npm --prefix functions install
npm start
```

## Build And Deploy

```bash
npm run build
npm --prefix functions run build
firebase deploy
```
