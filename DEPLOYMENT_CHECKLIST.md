# Deployment Checklist

## Pre-Deployment Setup

### Firebase Project
- [ ] Create Firebase project at console.firebase.google.com
- [ ] Note your Project ID
- [ ] Update `.firebaserc` with your Project ID
- [ ] Run `firebase login` and authenticate

### Firebase Services
- [ ] Enable Authentication > Email/Password
- [ ] Create Firestore Database in production mode
- [ ] Region: us-central1 (default)
- [ ] Deploy Firestore security rules:
  ```bash
  firebase deploy --only firestore:rules
  ```

### Twilio Account
- [ ] Create Twilio account at twilio.com
- [ ] Get Account SID
- [ ] Get Auth Token
- [ ] Get phone number (or rent a number)
- [ ] Verify receiving phone numbers (if trial account)
- [ ] Set up functions config:
  ```bash
  cd functions
  firebase functions:config:set \
    twilio.account_sid="ACxxxxxxx" \
    twilio.auth_token="your_token" \
    twilio.phone_number="+1234567890"
  ```

### Environment Variables
- [ ] Copy `.env.example` to `.env`
- [ ] Fill in all Firebase credentials from Firebase Console
- [ ] DO NOT commit `.env` to git
- [ ] Verify `.env` is in `.gitignore`

## Development Testing

### Local Testing
- [ ] Run `npm install` (frontend dependencies)
- [ ] Run `cd functions && npm install && cd ..` (functions dependencies)
- [ ] Run `npm start` (should start on localhost:3000)
- [ ] Test signup/login flow
- [ ] Test admin dashboard (after creating admin user)
- [ ] Test volunteer dashboard

### Admin User Creation
- [ ] Sign up a test admin account
- [ ] In Firebase Console > Firestore:
  - [ ] Create collection: `admins`
  - [ ] Add document with ID = your test user's UID
  - [ ] Add field: `isAdmin` = `true`
- [ ] Log out and log back in
- [ ] Verify redirected to /admin (not /dashboard)

### Create Test Data
- [ ] Create test event
- [ ] Create test volunteer (via signup)
- [ ] Assign volunteer to event
- [ ] Configure SMS reminder (set to trigger in 1-2 minutes)

### Test SMS Sending
- [ ] Open Cloud Functions logs: `firebase functions:logs`
- [ ] Wait for scheduled function to run (every minute)
- [ ] Check that SMS sends successfully
- [ ] Verify in `sentMessages` collection
- [ ] Receive SMS on your phone

## Pre-Deployment Checks

### Code Quality
- [ ] No console.log() debug statements left
- [ ] No hardcoded credentials in code
- [ ] TypeScript compiles without errors: `cd functions && npm run build`
- [ ] React builds successfully: `npm run build`

### Security
- [ ] Firestore rules are deployed
- [ ] Admin document created for admin user
- [ ] Twilio credentials set in Firebase config (not in .env)
- [ ] `.env` added to `.gitignore`
- [ ] No API keys in frontend code

### Performance
- [ ] Check bundle size: `npm run build`
- [ ] Verify Firestore indexes created (if needed)
- [ ] Test with slow network (DevTools > Network > Slow 3G)

## Deployment

### Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
firebase --version  # Should be 12.0.0+
```

### Step 2: Deploy Cloud Functions
```bash
cd functions
npm install  # If not already done
npm run build
cd ..
firebase deploy --only functions
```
- [ ] Functions deploy successfully
- [ ] Check Cloud Functions logs for errors

### Step 3: Deploy Frontend
```bash
npm run build
firebase deploy --only hosting
```
- [ ] Build completes successfully
- [ ] Hosting deploys without errors
- [ ] Provided URL in terminal

### Step 4: Deploy Everything (Alternative)
```bash
firebase deploy
```
- [ ] All services deploy successfully

## Post-Deployment Testing

### Access the Live App
- [ ] Open provided Firebase Hosting URL
- [ ] Check that it loads (may take 1-2 min)
- [ ] Test login/signup
- [ ] Admin access works

### Verify All Functions
- [ ] [ ] Signup as new volunteer
- [ ] [ ] Edit volunteer profile
- [ ] [ ] Login as admin
- [ ] [ ] Create service event
- [ ] [ ] Assign volunteer to event
- [ ] [ ] Configure SMS reminder
- [ ] [ ] Wait for SMS to send
- [ ] [ ] Check sent message in `sentMessages`

### Monitor Cloud Functions
- [ ] Check functions execution logs: `firebase functions:logs`
- [ ] Verify no errors in logs
- [ ] Monitor first 24 hours for issues

### Check Firestore
- [ ] Verify data created correctly
- [ ] Check collections: volunteers, serviceEvents, reminders, sentMessages
- [ ] Verify security rules working (try unauthorized access)

## Ongoing Maintenance

### Weekly
- [ ] Review Cloud Functions logs for errors
- [ ] Monitor SMS delivery in `sentMessages`
- [ ] Check for any failed reminders

### Monthly
- [ ] Review Firestore data size and optimize
- [ ] Check costs in Firebase Console
- [ ] Backup Firestore data
- [ ] Review security rules

### Quarterly
- [ ] Update dependencies: `npm update`
- [ ] Test disaster recovery (restore from backup)
- [ ] Performance review

## Common Issues & Fixes

### SMS Not Sending
- [ ] Check Twilio config: `firebase functions:config:get`
- [ ] Verify phone numbers in E.164 format (+1234567890)
- [ ] Check Twilio account has credits/SMS enabled
- [ ] Review Cloud Functions logs for errors

### Volunteers Not Appearing
- [ ] Check volunteer documents exist in Firestore
- [ ] Verify security rules allow reads
- [ ] Check browser console for errors

### Can't Log In
- [ ] Verify email in Firebase Authentication
- [ ] Check `.env` variables are loaded (refresh browser)
- [ ] Clear browser cache and try again

### Admin Can't Access Admin Dashboard
- [ ] Verify admin document exists in `admins` collection
- [ ] Check document ID matches user UID
- [ ] Verify `isAdmin: true` field set
- [ ] Log out and back in

## Success Criteria

✅ Deployment is successful when:
- [ ] App loads on Firebase Hosting URL
- [ ] Users can signup and login
- [ ] Admin dashboard accessible to admins only
- [ ] Events can be created and volunteers assigned
- [ ] SMS reminders send automatically
- [ ] No errors in Cloud Functions logs
- [ ] Data appears correctly in Firestore

## Rollback Plan

If something goes wrong:

1. **Frontend Issue**: 
   ```bash
   firebase deploy --only hosting
   # Or revert to previous build if available
   ```

2. **Functions Issue**:
   ```bash
   firebase deploy --only functions
   # Or use Firebase Console to revert version
   ```

3. **Database Issue**:
   - Restore from automated backup in Firebase Console
   - Usually available for 7 days

4. **All Gone Wrong**:
   - Use previous Firebase project backup
   - Restore from git history
   - Contact Firebase support

## Documentation for Users

After successful deployment:
- [ ] Send README.md to stakeholders
- [ ] Create user guide for admins
- [ ] Create user guide for volunteers
- [ ] Share password reset instructions
- [ ] Setup support email/contact

## Next Steps

- [ ] Monitor production for issues
- [ ] Gather user feedback
- [ ] Plan improvements (v1.1)
- [ ] Consider mobile app
- [ ] Explore additional integrations (email, calendar)

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Notes**: 

---

**Checklist Version**: 1.0
