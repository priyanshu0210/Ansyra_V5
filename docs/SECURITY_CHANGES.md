# Security changes — 7 September 2026

This pass preserves login and the existing member/admin permission model. It strengthens specific controls; it is not a claim that the application is unbreakable or a certification that deployment is ready.

| Area | Before this pass | After this pass |
| --- | --- | --- |
| Browser writes | Cookie settings provided the main cross-site protection. | Backend mutations also enforce the allowed origin, including login. Production requires an Origin header; development accepts the current local port. |
| Temporary passwords | The interface directed users to change their password. | Backend operations and CSV exports are blocked until setup completes. |
| Existing password changes | A logged-in session could request a new password without confirming the current password. | Existing accounts must confirm the current password. All prior sessions are revoked, then a new cookie is issued. Initial temporary-password setup remains supported. |
| Logged-out sessions | Token validation could accept an access token until its expiry even after logout. | A verified token must also refer to an active Supabase session. Tests prove immediate rejection of a logged-out cookie. |
| Cookies | Malformed or oversized session payloads were insufficiently constrained; HTTPS inference depended on headers. | Cookie payloads have strict limits. Production Secure cookies derive from the configured HTTPS site URL. |
| Upload confirmation | Prefix checks accepted more path shapes than the server issues. | Exact owner/deal prefix and generated filename shapes are enforced, alongside existing MIME/size checks. |
| CSV export | Text cells could be interpreted as spreadsheet formulas. | Formula-like text is escaped; numeric values retain their numeric meaning. |
| Database TLS | Strict certificate checking failed because the Supabase CA was unavailable. URL SSL options could override programmatic settings. | Supabase's official public root CA is bundled for its database hosts; URL SSL overrides are removed; remote connections require verified TLS. |
| Startup TLS check | A SQL query behind the pooler measured the pooler's separate backend connection. | Startup inspects Ansyra's actual client socket for encryption and certificate authorization. |
| Tests | Database-backed suites could depend on ambient hosted configuration and shared fixture passwords. | Loopback-only configuration, separate local fixture credentials, mock AI, and explicit local setup commands. |
| Dependencies | Two dependency advisories were found during this pass. | Updated lockfile; final audit reports zero known vulnerabilities. |

An API response is marked `Cache-Control: no-store`. Production security headers additionally restrict framing, embedded objects, form destinations and base URLs.

The local database revealed outdated test expectations after the earlier decision-trust changes. Recommendation lifecycle fixtures now attach real synthetic source rows. Scenario fixtures expect unestimated probabilities. Mock document flags quote actual supplied text and clearly label the concern as a demonstration. These changes preserve the stricter application rules.

## Verification completed

- 1,031 unit tests passed.
- 160 integration tests passed on isolated local Supabase, including real HTTP auth, cross-site writes, logout replay, password rotation, forced setup, organization isolation, CSV exports and document processing.
- 219 product regression tests passed on local Supabase.
- TypeScript checks, ESLint and production build passed.
- npm audit: zero known advisories at the time checked.
- The actual application database client completed a read-only hosted `SELECT 1` with TLS encryption and certificate authorization verified.
- Hosted metadata inspection found RLS enabled on all 29 application tables, with no direct CRUD grants for `anon` or `authenticated` roles. This application intentionally routes data through its backend; backend organization/feature checks remain essential because its database role bypasses RLS.
- Hosted deal-document and bug-screenshot buckets are private and have size/MIME limits. Avatars remain intentionally public images.
- The public privileged helper function is not executable by ordinary browser roles.

No hosted rows were seeded, reset or deleted during this pass. No hosting configuration was applied and no deployed smoke test was run.

## Still required before public sharing

1. **Disable direct signup in hosted Supabase Auth.** The `/auth/v1/settings` endpoint currently reports `disable_signup: false`. In Authentication's sign-in/provider settings, switch off **Allow new users to sign up** while keeping the **Email** provider enabled. Removing a signup screen alone does not close Supabase's signup endpoint. Existing invited accounts should continue to sign in. The available connector did not expose this Auth configuration update, and the browser was not signed into the dashboard.
2. Supabase's advisor reports **Leaked Password Protection Disabled**. Supabase currently reserves its built-in breach-password screening for Pro and above. This pass did not purchase an upgrade or add an external password-screening service. Use unique, generated demonstration credentials. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).
3. Reviewers should receive individual, least-privilege member accounts with fictional data. Reusing one editable account lets reviewers change each other's state or password and makes activity attribution unreliable.
4. Configure and verify the final HTTPS origin, trusted proxy/IP behaviour, Auth redirect allow-list, email delivery and environment secrets during the hosting step. Run deployed authenticated smoke tests then. Proxy trust remains conservative until a host is chosen.
5. Build and review the guided acquisition case and earnings bridge separately. They are not implemented by this security pass.

The Supabase “RLS Enabled No Policy” informational notices match the intentional server-only table access. Do not add broad browser policies merely to silence those notices. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

For local test commands, see [LOCAL_TESTING.md](LOCAL_TESTING.md). For the certificate model, see [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement). The bundled public CA expires in April 2031 and must be reviewed when Supabase rotates it.

## Addendum — 10 September 2026

The counts above describe the 7 September state. A full release-gate review and a remediation pass followed; both are recorded in `docs/release-review.md` (round 1, with its remediation log) and `docs/release-review-round-2.md` (post-remediation re-review). Headline changes since this note: spoof-resistant client-IP resolution for rate limits, organisation membership assigned only by id, deactivate-instead-of-delete offboarding, Storage cleanup on deal deletion plus a daily orphan sweep, validation of every document-analysis output, a data-processing acknowledgement gate on all live AI calls in production, a boot gate on the newest migration, and a production-posture Render blueprint. Unit suite at the time of the addendum: 73 files, 1,046 tests. The DB-backed suites had not been re-run since 7 September when this addendum was written; run `npm run test:local:integration` and `npm run test:local:regression` before release.
