# Volunteer Management App

A complete, production-ready volunteer management system built with Firebase and Twilio, designed for nonprofits.

## Features

✅ **User Management**
- Admin and volunteer roles
- Firebase Authentication
- Profile management

✅ **Event Management**
- Create and manage service events
- Assign volunteers to events
- Event status tracking

✅ **SMS Reminders**
- Automated SMS reminders via Twilio
- Scheduled Cloud Functions
- Configurable reminder timing
- Delivery tracking and logging

✅ **Security**
- Role-based access control
- Firestore security rules
- No sensitive data in frontend
- Admin-only reminder creation

✅ **Cost-Effective**
- Serverless architecture
- Firebase free tier eligible
- Minimal infrastructure costs
- Nonprofit pricing available

## Quick Start

### 1. Prerequisites
```bash
# Install Node.js 16+, then:
npm install -g firebase-tools
```

### 2. Setup Firebase
```bash
firebase login
firebase init
# Select: Firestore, Functions, Hosting, Authentication
```

### 3. Configure Environment
```bash
# Copy and fill in Firebase credentials
cp ENV_TEMPLATE.md .env
# Edit .env with your Firebase project config
```

### 4. Setup Twilio
```bash
cd functions
firebase functions:config:set \
  twilio.account_sid="YOUR_SID" \
  twilio.auth_token="YOUR_TOKEN" \
  twilio.phone_number="+1234567890"
```

### 5. Install & Deploy
```bash
# Install dependencies
npm install
cd functions && npm install && cd ..

# Deploy everything
firebase deploy

# Or deploy separately:
npm run deploy:functions  # Deploy Cloud Functions
npm run deploy:hosting    # Deploy React app
```

### 6. Create Admin User
1. Sign up a new account
2. In Firebase Console → Firestore → Create `admins` collection
3. Add document with your UID and `isAdmin: true`

### 7. Start Using
- Navigate to deployed app
- Admin logs in and accesses `/admin`
- Volunteers access `/dashboard`

## Project Structure

```
├── functions/              # Cloud Functions (TypeScript)
│   └── src/index.ts       # Scheduled SMS sender
├── src/                    # React frontend
│   ├── config/            # Firebase setup
│   ├── pages/             # Auth, Admin, Volunteer dashboards
│   ├── helpers/           # Types and utilities
│   └── App.tsx            # Main router
├── firestore.rules        # Security rules
├── firebase.json          # Firebase config
└── SETUP_GUIDE.md        # Detailed setup instructions
```

## Key Technologies

- **Frontend**: React 18 with React Router
- **Backend**: Firebase (Auth, Firestore, Functions, Hosting)
- **SMS**: Twilio SDK
- **Language**: TypeScript
- **Styling**: CSS3 with gradients and flexbox

## Database Schema

### Collections
- **volunteers**: User profiles
- **serviceEvents**: Events with assigned volunteers
- **reminders**: SMS reminders (admin-protected)
- **sentMessages**: SMS delivery logs

### Security Model
- Admins: Full read/write access
- Volunteers: Read/write own profile only
- Volunteers: Read assigned events only
- Reminders: Admin-only (no frontend writes)

## How SMS Reminders Work

1. **Admin sets reminder**: "Send 24 hours before event"
2. **Cloud Function runs**: Every minute, checks for pending reminders
3. **Reminder time reached**: Cloud Function sends SMS via Twilio
4. **Update status**: Marks as "sent" or "failed" in Firestore
5. **Audit log**: Records all sent messages in `sentMessages`

## Important Security Notes

⚠️ **Never expose**:
- Firebase Admin SDK credentials
- Twilio Account SID or Auth Token
- API Keys in frontend code

✅ **These are safely stored**:
- Twilio credentials in Firebase Functions config
- Private keys stay on Firebase servers
- Frontend only uses public Firebase API key

## Common Tasks

### Add a New Event
1. Log in as admin
2. Go to Events tab
3. Fill in event details
4. Click "Create Event"

### Assign Volunteer to Event
1. Go to Volunteers tab
2. Select volunteer
3. Click "Assign to Event"
4. Choose event from dropdown

### Send SMS Reminders
1. Go to SMS Reminders tab
2. Select event
3. Set hours before event (e.g., 24)
4. Customize message
5. Click "Create Reminders"

### Update Your Profile (Volunteer)
1. Log in as volunteer
2. Click "Edit Profile"
3. Update name, phone, address
4. Click "Save Changes"

## Troubleshooting

**SMS not sending?**
- Check Cloud Functions logs: `firebase functions:logs`
- Verify Twilio config: `firebase functions:config:get`
- Check phone numbers in E.164 format (+1234567890)

**Can't log in?**
- Verify email in Firebase Authentication
- Check Firestore rules are deployed
- Clear browser cache and cookies

**Admin access denied?**
- Verify admin document exists in `admins` collection
- Check your UID matches in Firestore
- Ensure `isAdmin: true` field is set

## Cost Estimate (Monthly)

| Service | Free Tier | Estimated Cost |
|---------|-----------|---|
| Firebase | 50K writes, 100K reads | $0-5 |
| Twilio SMS | Free tier limited | $0.0075/SMS |
| Hosting | 1 GB/month | $0-1 |
| **Total** | | **$0-10** |

## Next Steps

1. **Customize branding**: Update colors and logos
2. **Add email notifications**: Use SendGrid extension
3. **Mobile app**: Build with React Native
4. **Advanced analytics**: Add dashboard metrics
5. **Event templates**: Create recurring event types

## Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Twilio Documentation](https://www.twilio.com/docs)
- [React Documentation](https://react.dev)
- [Cloud Functions Guide](https://firebase.google.com/docs/functions)

## Support

For issues:
1. Check `SETUP_GUIDE.md` for detailed troubleshooting
2. Review Firebase Console logs
3. Check Cloud Functions execution logs
4. Verify Firestore security rules

## License

MIT - Available for nonprofit use

---

**Ready to deploy?** Follow `SETUP_GUIDE.md` for step-by-step instructions.
