# Go-live smoke script (Phase 13.7)

Run this top-to-bottom against **production** immediately after every deploy.
Total time: ~10 minutes. Every step must pass; stop and roll back on the first failure.

Export these first — the commands below read them, and nothing here names a
specific deployment:

```bash
export HOST="https://your-production-origin"   # e.g. https://app.ansyra.example
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon key>"          # the public one, not service_role
```

Accounts needed: your main-admin account, your member account, and one
disposable email you control for the invite/reset round-trips.

## 0. Liveness

```bash
curl -sf "$HOST/api/trpc/ping" | grep -q '"ok":true' && echo PASS
```

Also confirm the landing page renders (HTML, not an error page):

```bash
curl -sf "$HOST/" | grep -q "Ansyra" && echo PASS
```

## 1. Security posture (curl)

```bash
# Headers: expect strict-transport-security, x-frame-options: DENY,
# content-security-policy, x-content-type-options: nosniff
curl -sfI "$HOST/" | grep -iE "strict-transport|x-frame|content-security|nosniff"

# Error responses must NOT contain "stack"
curl -s "$HOST/api/trpc/nonexistent" | grep -vq '"stack"' && echo PASS

# Supabase REST hole stays closed (S1 regression check) — expect [] or a
# permission error, never data rows:
curl -s -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/deals?select=*"
```

## 2. Auth (browser)

1. `/login` → wrong password 6× fast → expect a rate-limit error on attempt 6.
2. Log in with the **member** account → dashboard loads, tabs match granted features.
3. "Forgot password?" → request reset for your disposable email → email arrives →
   complete the reset → log in with the new password.

## 3. Core product loop (browser, member account)

1. Deal Pipeline → create a deal (name, value like `$25M`, industry) → it appears.
2. Open the deal dossier → **Data Room** → upload a small PDF → run "Red flags"
   analysis → verbatim quotes appear → refresh → everything persists.
3. Any AI tab (e.g. Assumption Ledger) → run one analysis → result renders and
   the AI disclaimer shows beneath it → refresh → result still there.
4. Dossier → Export PDF → print preview shows letterhead + disclaimer footer.
5. Delete the test deal.

## 4. Admin loop (browser, admin account)

1. Landing page → Request Access (individual) → submit with the disposable email.
2. Log in as admin → Access Requests shows it (and the notification email arrived
   if Resend is configured) → approve with 2–3 features.
3. Invite email arrives → complete `/welcome` → new member sees exactly the
   granted tabs. (No SMTP? The temp-password fallback + forced change must work.)
4. Delete the throwaway user afterwards (User Management).

## 5. Monitoring

1. Sentry: trigger a test error (e.g. bad route in the SPA or a temporary
   `throw` behind an admin-only path) → event appears in Sentry with the
   expected environment + release. Skip if SENTRY_DSN unset.
2. Uptime monitor: confirm the ping check on `$HOST/api/trpc/ping` reports UP.

## 6. Regression sweep

- 375px viewport: landing, login, one dashboard tab — no overlap/h-scroll.
- Legal pages `/legal/terms` + `/legal/privacy` load logged-out.
- Sign out → protected routes bounce to `/login`.
