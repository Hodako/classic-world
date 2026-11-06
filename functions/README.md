# Employee device linking

The static POS calls Firebase callable functions in `us-central1`. No employee PIN or password is placed in the linking code. The owner generates a 12-character code, valid for ten minutes and one redemption, for an existing employee. Issuing another code replaces the previous code. Redeeming the code creates a separate Firebase Auth identity for that device. Owners can unlink individual devices from Employees; the POS checks linked sessions on reload and every minute while open and online.

## Enable on your Firebase project

1. Sign in with the parent business Google or email/password Firebase account. Any parent account can issue codes for its own employee records; there is no fixed owner allowlist. Cached POS roles and employee device identities are not accepted as owner authority.
2. New employees receive an immutable `owner_uid` from the authenticated parent account. Existing employee records without `owner_uid` need a trusted administrator to assign the correct Firebase owner UID using the Admin SDK or Firebase console. Clients cannot claim legacy employees for themselves. Verify ownership before migrating each record.
3. Run `npm --prefix functions install`, then deploy this codebase and `firestore.rules`: `firebase deploy --only functions:employee-device-link,firestore:rules`. Cloud Functions requires an appropriate Firebase billing plan. The runtime service account needs permission to sign custom auth tokens (`iam.serviceAccounts.signBlob`).
4. Build and deploy the static frontend using the project's normal deployment process.
5. Owner: Employees → Link device → Generate new code. Employee: `/login` → Employee → enter the code and optional device name.

Run `node --test functions/device-link.test.cjs scripts/pos-regression.test.cjs` for local regression tests. These use in-memory test doubles; deployment should also be verified with the Firebase emulators and a real owner/employee device.

The existing app stores most POS data under public Firestore rules. This change blocks all browser reads and writes to pairing codes, current-code pointers, rate limits, and linked-device records. Writes to owned employee records require their authenticated parent, and ownership cannot be changed by clients. Legacy employee reads remain available for the old PIN login, and legacy edits cannot assign ownership. Access control for the other POS collections needs a separate authorization migration before production use with untrusted clients.

Device codes and device management are scoped to the authenticated parent's Firebase UID. Each employee profile carries that business identity. Several existing POS collections still use global shop data; this feature does not migrate all inventory, sales, or branding into tenant-specific collections.

Dependency validation: the callable exports load with the installed Firebase SDKs. The dependency audit still reports six moderate upstream findings in the Firebase Admin dependency tree (`glob`/`minimatch` via Google Cloud libraries); compatible `npm audit fix` did not resolve them. Review those findings before production deployment.
