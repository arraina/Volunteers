# Environment Variables Template

Copy this to `.env` in the root directory and fill in your Firebase credentials.

```
# Firebase Configuration
# Get these from Firebase Console > Project Settings > General
REACT_APP_FIREBASE_API_KEY=YOUR_API_KEY_HERE
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Optional: For local emulator testing
# REACT_APP_USE_EMULATOR=true
```

## How to Find Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click ⚙️ (Settings) → Project Settings
4. Under "General" tab, scroll down to "Your apps" section
5. Look for the Web app configuration
6. The config will look like:
```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "project.firebaseapp.com",
  projectId: "project-id",
  storageBucket: "project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcd1234"
};
```

7. Copy each value to the corresponding `.env` variable

## Firebase Functions Config (Twilio)

In the `functions` directory, these are set via CLI:

```bash
cd functions

firebase functions:config:set \
  twilio.account_sid="ACxxxxxxxxxxxxxxxx" \
  twilio.auth_token="your_auth_token_here" \
  twilio.phone_number="+1234567890"
```

These values are **NOT** stored in `.env` - they're stored in Firebase's secure config system.
