# Architecture & Security Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          VOLUNTEERS APP                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐
│   Firebase Hosting       │
│   (React Frontend)       │
│  ✓ Auth pages            │
│  ✓ Admin dashboard       │
│  ✓ Volunteer portal      │
└────────────┬─────────────┘
             │
             └─────────────────────────────────────────────────┐
                                                               │
┌──────────────────────────────────────────────────────────────────┐
│                    Firebase Backend                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐   ┌──────────────────────────────┐    │
│  │  Firebase Auth      │   │  Firestore Database          │    │
│  │  ✓ Email/Password   │   │  Collections:                │    │
│  │  ✓ Session mgmt     │   │  • volunteers                │    │
│  │  ✓ UID tracking     │   │  • serviceEvents             │    │
│  │                     │   │  • reminders (protected)      │    │
│  └─────────────────────┘   │  • sentMessages (audit)       │    │
│                            │                              │    │
│                            │  Security Rules:             │    │
│                            │  • Admin: full read/write     │    │
│                            │  • Volunteer: own profile     │    │
│                            │  • Volunteer: assigned events │    │
│                            └──────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Cloud Functions (Scheduled)                             │   │
│  │  ✓ sendSMSReminders: runs every minute                  │   │
│  │    - Queries pending reminders (status='pending')        │   │
│  │    - Filters by reminderTime <= now                      │   │
│  │    - Sends SMS via Twilio for each reminder              │   │
│  │    - Updates status: 'sent' or 'failed'                 │   │
│  │    - Logs in sentMessages collection                     │   │
│  │  ✓ createRemindersForEvent: callable (admin-only)       │   │
│  │  ✓ triggerReminderCheck: callable (manual check)        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
                                 │
                                 └──────────────────┐
                                                    │
                       ┌────────────────────────────┴─────────────┐
                       │                                           │
                    ┌──────────────────┐                    ┌──────────────────┐
                    │  Twilio API      │                    │  Logs & Monitoring
                    │  ✓ Send SMS      │                    │  ✓ Cloud Logging
                    │  ✓ Track delivery│                    │  ✓ Error tracking
                    │  ✓ Message SID   │                    │  ✓ Performance
                    └──────────────────┘                    └──────────────────┘
```

## Data Flow

### Reminder Creation Flow
1. Admin creates event with assigned volunteers
2. Admin goes to "SMS Reminders" tab
3. Admin selects event + timing + message
4. Frontend calls `createRemindersForEvent` function
5. Function verifies admin role
6. Creates `reminder` documents for each volunteer:
   - eventId, volunteerId, phoneNumber
   - message, reminderTime, status="pending"
7. Documents stored in `reminders` collection

### SMS Sending Flow
1. Cloud Function `sendSMSReminders` triggered (every 1 minute)
2. Query: Get all reminders where status="pending" AND reminderTime <= now
3. For each matching reminder:
   - Send SMS via Twilio to phoneNumber
   - On success: update status="sent", set sentAt=now, store twilioSid
   - On failure: update status="failed", store failureReason
4. Create audit log in `sentMessages` collection
5. Repeat next minute

## Security Implementation

### Firestore Rules Strategy

```javascript
// Admin check function
function isAdmin() {
  return get(/databases/$(database)/documents/admins/$(request.auth.uid))
    .data.isAdmin == true;
}

// Collection-level rules
├── admins: isAdmin only
├── volunteers: 
│   ├── Admins: full access
│   └── Self: read/write own only
├── serviceEvents:
│   ├── Admins: full access
│   └── Volunteers: read assigned only
├── reminders: isAdmin only (no volunteer access)
└── sentMessages: isAdmin only
```

### Frontend Security (No Secrets Exposed)

✅ Safe to expose in frontend:
- Firebase API Key (public)
- Project ID
- Auth Domain

❌ Never exposed:
- Firebase Private Key
- Twilio Account SID
- Twilio Auth Token
- Admin credentials

### Backend Security (Cloud Functions)

✅ Secure configuration:
- Twilio credentials stored in Firebase Functions Config
- Environment variables NOT in code
- Set via `firebase functions:config:set`
- Accessed from `process.env` at runtime
- Never logged or displayed

## Authentication Flow

### Sign Up (Volunteer)
```
User fills form
  ↓
Frontend calls Firebase Auth createUserWithEmailAndPassword
  ↓
Firebase creates user account
  ↓
Frontend creates volunteer profile doc in Firestore
  ↓
User logged in, redirected to /dashboard
```

### Sign Up (Admin)
```
Admin creates account (same as above)
  ↓
Admin OR system creates admin document:
  • Collection: admins
  • Document ID: user's UID
  • Field: isAdmin = true
  ↓
Next login: system detects admin, routes to /admin
```

### Login
```
User enters email/password
  ↓
Frontend calls Firebase Auth signInWithEmailAndPassword
  ↓
Check isUserAdmin()
  ├─ true: route to /admin
  └─ false: route to /dashboard
```

## Firestore Indexes

The app requires two composite indexes (created automatically on first use):

1. **For volunteer event queries**
   - Collection: serviceEvents
   - Fields: assignedVolunteers (array) + eventDateTime (descending)

2. **For pending reminders**
   - Collection: reminders
   - Fields: status (ascending) + reminderTime (ascending)

If you see index creation prompts, just click the links in Firebase Console.

## Cost Optimization

### Reducing Firestore Costs

| Operation | Cost | Optimization |
|-----------|------|---|
| Reads | $0.06/100K | Cache frequently read data |
| Writes | $0.18/100K | Batch operations, use transactions |
| Deletes | $0.02/100K | Auto-delete old reminders |
| Queries | Counted as reads | Paginate large queries |

**Monthly estimate for 100 volunteers, 4 events/month:**
- ~400 reads (dashboard, profile): $0.024
- ~80 writes (create events, reminders): $0.014
- **Total**: ~$0.04/month

### SMS Costs

Twilio pricing varies by country:
- US: ~$0.0075 per SMS
- International: $0.05-0.50 per SMS
- Bulk discounts available for nonprofits

**For 100 volunteers, 24-hour reminder:**
- $0.75/event × 4 events/month = $3/month

## Monitoring & Logging

### Cloud Functions Logs
```bash
firebase functions:logs
```

Shows:
- Function execution times
- Errors and exceptions
- Custom log messages from code
- SMS send successes/failures

### Firestore Logs
Firebase Console → Firestore → Logs
Shows all document reads/writes

### SMS Delivery Tracking
`sentMessages` collection contains:
- Message ID, phone number
- Twilio SID (unique ID)
- Status: success/failed
- Timestamp
- Failure reason (if applicable)

## Scaling Considerations

### For Large Deployments (1000+ volunteers)

1. **Batch Size**: Increase from 100 to 200 reminders per batch
2. **Function Timeout**: Increase from 60s to 120s if needed
3. **Composite Index**: May auto-create, just approve
4. **Rate Limiting**: Twilio handles automatically
5. **Backup**: Enable Firestore backups for large data

### Limits to Be Aware Of

| Limit | Value | Mitigation |
|-------|-------|---|
| Function execution time | 9 minutes | Batch processing |
| Firestore document size | 1 MB | Split large docs |
| Firestore write rate | 1 write/sec/doc | Use batch writes |
| SMS queue | No limit | Twilio handles |

## Disaster Recovery

### Backup Strategy
1. Enable automated Firestore backups (in console)
2. Set retention to 7 days
3. Test restore process quarterly

### Rollback Plan
1. Keep previous Cloud Function versions
2. Can instantly revert via Firebase Console
3. Firestore data automatically versioned

## Compliance & Privacy

### GDPR Compliance
- Users can request data deletion
- Add "Delete My Account" feature to UI
- Automatic deletion of sensitive SMS logs after 30 days

### Privacy Best Practices
- Never log full phone numbers in console
- Use phone masking: `***-***-${lastFour}`
- Encrypt sensitive data in transit (HTTPS enforced)
- Admin-only access to reminders

## Development vs Production

### Development (Local Emulator)
```bash
firebase emulators:start
# Runs on localhost - no real SMS sent
# Real data not at risk
# Fast iteration
```

### Staging (Firebase Project)
```bash
# Use separate Firebase project
# Real SMS sent to test numbers
# Test with production data subset
# Before main deployment
```

### Production
```bash
# Main Firebase project
# Real SMS to volunteers
# Real production data
# Monitor closely
```

---

**Last Updated**: 2024
**Version**: 1.0.0
