# Volunteer Management App - Setup & Deployment Guide

## Overview

This is a complete Firebase + Twilio volunteer management system with:
- **Frontend**: React with Firestore real-time database
- **Backend**: Firebase Cloud Functions for SMS reminders
- **Auth**: Firebase Authentication
- **SMS**: Twilio integration for automated reminders
- **Hosting**: Firebase Hosting

## Project Structure

```
Volunteers/
├── functions/                 # Cloud Functions (Node.js/TypeScript)
│   ├── src/
│   │   └── index.ts          # Scheduled SMS sender + helper functions
│   ├── package.json
│   └── tsconfig.json
├── src/                       # React Frontend
│   ├── config/
│   │   └── firebase.ts       # Firebase initialization
│   ├── helpers/
│   │   └── types.ts          # TypeScript interfaces & utilities
│   ├── pages/
│   │   ├── Auth.tsx          # Login/Signup
│   │   ├── AdminDashboard.tsx # Admin interface
│   │   └── VolunteerDashboard.tsx # Volunteer interface
│   ├── App.tsx               # Main router
│   ├── index.tsx             # Entry point
│   └── index.css
├── public/
│   └── index.html            # HTML template
├── firestore.rules           # Firestore security rules
├── firebase.json             # Firebase config
└── .firebaserc              # Firebase project reference
```

## Prerequisites

Before starting, ensure you have:
1. **Node.js** 16+ and npm installed
2. **Firebase CLI**: `npm install -g firebase-tools`
3. **Firebase Project**: Create one at [console.firebase.google.com](https://console.firebase.google.com)
4. **Twilio Account**: Sign up at [twilio.com](https://www.twilio.com)
5. **Git** (optional, for version control)

## Step 1: Firebase Project Setup

### 1.1 Create Firebase Project
```bash
# Login to Firebase
firebase login

# Create a new project or use existing
firebase init

# During init, select:
# - Firestore
# - Functions
# - Hosting
# - Authentication
```

### 1.2 Update `.firebaserc`
Replace `YOUR_FIREBASE_PROJECT_ID` with your actual Firebase project ID:
```json
{
  "projects": {
    "default": "your-project-id-123"
  }
}
```

### 1.3 Enable Firebase Services
In Firebase Console:
1. Go to **Authentication** → Enable Email/Password
2. Go to **Firestore Database** → Create database in production mode
3. Go to **Storage** → (optional, for future file uploads)

## Step 2: Setup Firestore Security Rules

1. In Firebase Console, go to **Firestore Database** → **Rules**
2. Copy the contents of `firestore.rules` and paste it
3. Click **Publish**

These rules ensure:
- **Admins** can read/write all documents
- **Volunteers** can only edit their own profile
- **Volunteers** can read only events assigned to them
- **Reminders** are protected from frontend writes (admin only)

## Step 3: Twilio Configuration

### 3.1 Get Twilio Credentials
1. Sign in to [Twilio Console](https://www.twilio.com/console)
2. Get your:
   - **Account SID** (Account section)
   - **Auth Token** (Account section)
   - **Phone Number** (Phone Numbers section)

### 3.2 Set Twilio Config in Firebase Functions

```bash
cd functions

# Set Twilio credentials (replace with YOUR values)
firebase functions:config:set \
  twilio.account_sid="your_account_sid_here" \
  twilio.auth_token="your_auth_token_here" \
  twilio.phone_number="+1234567890"
```

Verify the config is set:
```bash
firebase functions:config:get
```

You should see output like:
```json
{
  "twilio": {
    "account_sid": "AC...",
    "auth_token": "your_token...",
    "phone_number": "+1234567890"
  }
}
```

## Step 4: Frontend Environment Variables

Create a `.env` file in the root directory:

```bash
# .env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

Get these values from:
Firebase Console → Project Settings → General tab

## Step 5: Create Admin User

You need to manually add an admin record to Firestore:

1. In Firebase Console → Firestore Database
2. Create a new collection: `admins`
3. Add a document with:
   - **Document ID**: Your Firebase UID (get from Authentication tab)
   - **Field**: `isAdmin` = `true`

Example document:
```
admins/
  ├── uid_of_admin_user
      └── isAdmin: true
```

## Step 6: Deploy

### 6.1 Deploy Firestore Rules (already done if updated in console)
```bash
firebase deploy --only firestore:rules
```

### 6.2 Deploy Cloud Functions
```bash
cd functions
npm install
npm run build
npm run deploy
```

Or from root:
```bash
firebase deploy --only functions
```

### 6.3 Build and Deploy Frontend
```bash
npm install
npm run build
firebase deploy --only hosting
```

### Deploy Everything at Once
```bash
firebase deploy
```

## Step 7: Local Development

### Frontend Development
```bash
# Install dependencies
npm install

# Start development server
npm start
# Opens at http://localhost:3000
```

### Cloud Functions Emulator
```bash
cd functions
npm install
npm run build

# In root directory
firebase emulators:start --only functions
```

### Full Local Emulator Suite
```bash
firebase emulators:start
```

This starts:
- **Firestore Emulator**: `http://localhost:8080`
- **Functions Emulator**: `http://localhost:5001`
- **Auth Emulator**: `http://localhost:9099`

To use emulators in development, uncomment the connector code in `src/config/firebase.ts`.

## Usage Guide

### Admin Workflow
1. Sign up with an admin email
2. Have the admin record added in Firestore
3. Access `/admin` dashboard
4. **Create Events**: Add service opportunities
5. **Manage Volunteers**: View and assign volunteers to events
6. **Configure Reminders**: Set SMS reminders (X hours before event)

### Volunteer Workflow
1. Sign up on the app
2. Complete profile (name, phone, address)
3. Admins assign you to events
4. View your assigned events on dashboard
5. Receive SMS reminders before events

### SMS Reminder Flow
1. Admin creates an event and assigns volunteers
2. Admin configures reminder (message + hours before)
3. Cloud Function runs every minute checking for pending reminders
4. When reminder time arrives, SMS is sent via Twilio
5. Reminder status updated to "sent" or "failed"
6. All activity logged in `sentMessages` collection

## Database Schema

### Collections

#### `volunteers`
```typescript
{
  name: string;
  email: string;
  phoneNumber: string;
  address?: string;
  availableHours?: number;
  joinedDate: Timestamp;
  createdAt: Timestamp;
}
```

#### `serviceEvents`
```typescript
{
  topic: string;
  description?: string;
  eventDateTime: Timestamp;
  location?: string;
  assignedVolunteers: string[]; // Array of volunteer UIDs
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `reminders` (Admin-only)
```typescript
{
  eventId: string;
  volunteerId: string;
  phoneNumber: string;
  message: string;
  reminderTime: Timestamp;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Timestamp;
  hoursBeforeEvent: number;
  retryCount?: number;
  createdAt: Timestamp;
}
```

#### `sentMessages` (Audit log)
```typescript
{
  reminderId: string;
  volunteerId: string;
  eventId: string;
  phoneNumber: string;
  message: string;
  status: 'success' | 'failed';
  twilioSid?: string;
  failureReason?: string;
  sentAt: Timestamp;
}
```

## Troubleshooting

### SMS Not Sending
1. Check Twilio config: `firebase functions:config:get`
2. Check Cloud Functions logs: `firebase functions:logs`
3. Verify phone numbers are in E.164 format (e.g., +14155552671)
4. Check Twilio account has sufficient credits

### Authentication Issues
1. Verify Firebase Auth is enabled in console
2. Check security rules allow auth
3. Verify `.env` variables are correctly set

### Firestore Permission Denied
1. Review `firestore.rules` matches your requirements
2. Verify admin document exists for admin users
3. Check user UID in Firestore matches authentication UID

### Functions Won't Deploy
1. Ensure Node.js 18+ is installed
2. Check TypeScript compiles: `cd functions && npm run build`
3. Verify Twilio config is set before deploying

## Scaling & Optimization

### For Large Numbers of Reminders
- The Cloud Function processes reminders in batches of 100
- Adjust `limit(100)` in `functions/src/index.ts` if needed
- Increase function timeout in Firebase Console if needed

### Firestore Optimization
- Use composite indexes for complex queries
- Consider pagination for large volunteer lists
- Archive old reminder records to separate collection

### Cost Reduction (Nonprofit)
1. Apply for **Google.org funding** (free Firebase)
2. Use **Twilio nonprofit rates**
3. Optimize queries to reduce read costs
4. Set Firestore to delete old records after 90 days

## Next Steps

1. **Customize branding**: Update colors in CSS files
2. **Add event templates**: For recurring event types
3. **Email notifications**: Add Firebase Extensions for email
4. **Advanced reporting**: Add analytics dashboard
5. **Mobile app**: Use React Native with same Firebase backend
6. **Backup strategy**: Regular Firestore backups

## Support & Resources

- **Firebase Docs**: https://firebase.google.com/docs
- **Twilio Docs**: https://www.twilio.com/docs
- **React Docs**: https://react.dev
- **Firebase CLI**: https://firebase.google.com/docs/cli

## License

MIT - Free for nonprofit use

---

**Last Updated**: 2024
**Version**: 1.0.0
