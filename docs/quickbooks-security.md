# QuickBooks security and operations

## Scope

The Community Hub uses the QuickBooks Online Accounting API to display Profit and Loss,
Balance Sheet, and Transaction List reports on demand. It does not create or edit QuickBooks
transactions, use the Payments or Payroll APIs, run scheduled synchronization, or persist
report contents in Firestore. QuickBooks information must not be supplied to generative-AI
features.

## Access and secrets

- Only the Hub Owner may connect, reconnect, or disconnect QuickBooks.
- The Owner and active Fundraising Department Admins with MFA may view reports.
- Other department members, volunteers, and shared-link users cannot access QuickBooks reports.
- Production client credentials are stored in Firebase Secret Manager and are never exposed to
  browser code or committed to source control.
- OAuth tokens are stored in the server-only `quickbooksConnections` collection. Firestore
  rules deny all client access, and Google Cloud encrypts Firestore data at rest.
- All browser, Cloud Function, OAuth, and QuickBooks API traffic uses HTTPS.

## OAuth lifecycle

- Authorization uses a cryptographically random, hashed, single-use state value that expires
  after ten minutes.
- Access tokens are refreshed on demand with a two-minute safety window.
- A Firestore lease prevents concurrent requests from rotating one refresh token twice.
- Both replacement access and refresh tokens are stored after refresh.
- Invalid or expired authorization marks the connection as requiring Owner reconnection.
- Disconnect attempts Intuit revocation, removes local tokens, and warns the Owner if Intuit
  did not confirm remote revocation.

## Logging and retention

Failed Intuit requests create a sanitized security event containing only the operation,
HTTP status, Intuit troubleshooting ID (`intuit_tid`), error code, actor UID, and timestamps.
Authorization headers, tokens, report contents, donor information, and Intuit error messages
must not be logged. Security events are visible only to the Hub Owner and carry a 30-day
expiration field. Enable a Firestore TTL policy on `securityEvents.expiresAt` so deletion is
automatic.

## Incident response

If unauthorized access, credential exposure, or suspicious QuickBooks activity is suspected:

1. The Owner disconnects QuickBooks in the Hub and removes the app connection in QuickBooks.
2. Rotate the Intuit Client Secret and relevant Firebase credentials.
3. Disable affected Hub accounts and review MFA enrollment and administrator membership.
4. Preserve sanitized Cloud Function and `securityEvents` logs for investigation.
5. Determine which data and users were affected and notify temple leadership, Intuit, users,
   insurers, or authorities when required.
6. Correct the cause, test in the sandbox, and document approval before reconnecting production.

Security concerns should be reported to `info@iskconofnewjersey.org`.

## Verification before production

- Test connect, report, disconnect, and reconnect with a sandbox company.
- Test malformed dates, unsupported report names, expired access tokens, expired refresh tokens,
  invalid grants, revoked authorization, rate limits, and Intuit server failures.
- Confirm every error shown to a user is generic and contains no token or financial data.
- Confirm failed Intuit calls record `intuit_tid` when supplied.
- Review Owner and Fundraising Department Admin access at least quarterly.
- Run dependency and vulnerability scans before production releases and remediate material findings.
- Review Intuit's current security requirements before each compliance attestation.
