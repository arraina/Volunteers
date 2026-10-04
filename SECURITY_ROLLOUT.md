# Security rollout checklist

The application code now defaults to invitation-only signup, MFA for privileged
roles, App Check on callable functions, throttling, signed Meta webhooks, a CSP,
session revocation, and monthly access-review records.

Complete these provider settings before deployment:

1. In Google Cloud, enable Identity Platform and TOTP MFA for the Firebase project.
2. In reCAPTCHA Enterprise, create a website key for `arraina.github.io`, register
   it with Firebase App Check for the web app, and add the public key to both the
   local `.env` and the GitHub Actions variable
   `REACT_APP_FIREBASE_APP_CHECK_SITE_KEY`.
3. In Firebase App Check, monitor valid traffic first, then enable enforcement for
   Firestore. Callable functions enforce App Check in code at deployment time.
4. Add the Meta app secret to Secret Manager as `WHATSAPP_APP_SECRET`. This is the
   App Secret from Meta App Dashboard, not the webhook verify token or access token.
5. Configure a Firestore TTL policy on `securityRateLimits.expiresAt` so expired
   throttle buckets are removed automatically.
6. After deployment, each Owner/Admin signs in once and enrolls an authenticator
   app. Department Admins must also use MFA for privileged department changes.
7. Each month, the scheduled function creates `securityAccessReviews/YYYY-MM` with
   status `pending`. The Owner should compare active Admin and Department Admin
   access against current responsibilities and remove access that is no longer needed.

Do not deploy the functions before steps 1, 2, and 4 are complete: doing so would
reject legitimate callable requests or prevent privileged users from completing work.
