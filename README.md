# Temple Volunteers

Simple volunteer management app for a nonprofit/temple, using Firebase Auth, Firestore, Hosting, Cloud Functions, and Twilio SMS reminders.

## Folder Structure

```text
/
  index.html                 Static app source, vehicle-style architecture
  app.js                     Main browser app controller
  auth.js                    Auth/session manager
  storage.js                 Firestore/local demo data manager
  ui.js                      DOM rendering
  firebase-config.js         Firebase web config, no Twilio secrets
  local-data.js              Demo seed data
  styles.css
  volunteers/                Firebase Hosting public folder, mirrored static app
  src/                       React reference implementation/components
    config/firebase.ts
    helpers/
    pages/
  functions/
    src/index.ts             Scheduled SMS sender and admin callables
    package.json
    tsconfig.json
  firestore.rules
  firestore.indexes.json
  firebase.json
```

## Implemented

- Firebase SDK v10 compat scripts in the hosted static app.
- Firebase Auth login/signup.
- Admin dashboard:
  - create service events with topic, date/time, location, and status
  - update event status
  - assign volunteers to events
  - create/remove volunteers
  - configure reminder rules with message, hours before event, and preferred send time
  - view existing reminder rules
- Volunteer dashboard:
  - edit own profile
  - view only assigned events
- Firestore rules:
  - admins can manage app records
  - volunteers can read/update only their profile
  - volunteers can read only assigned events
  - reminders and sent message writes are blocked from frontend clients
- Cloud Functions:
  - `sendSMSReminders` scheduled every minute
  - sends pending due reminders through Twilio
  - updates reminders to `sent` or `failed`
  - logs deliveries in `sentMessages`
  - `createRemindersForEvent` creates reminder docs server-side
  - `createVolunteer`, `deleteVolunteer`, `deleteServiceEvent`
  - `claimInitialAdmin` lets the first signed-in user bootstrap admin access only if no admin exists yet
- Firebase Hosting serves `volunteers/`.
- Firestore composite index for `reminders.status + reminders.reminderTime`.

## First Admin

After deploying Functions and enabling Firebase Auth, sign up in the app. If no admin exists yet, the volunteer page shows **Claim Admin Access**. Click it, then log out and back in.

This creates:

```text
admins/{uid}
  isAdmin: true
```

## Twilio Configuration

Preferred Firebase v2 secrets:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_PHONE_NUMBER
```

Legacy config style is also supported:

```bash
firebase functions:config:set twilio.account_sid="AC..." twilio.auth_token="..." twilio.phone_number="+15551234567"
```

Never store Twilio credentials in frontend files.

## Deploy

```bash
npx firebase login
npx firebase deploy --only firestore,functions,hosting
```

For hosting only:

```bash
npx firebase deploy --only hosting
```
