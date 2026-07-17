# Authentication release and operations runbook

This runbook completes the environment-owned steps that cannot be applied from source control. Never paste credentials, access tokens, magic links, or raw images into tickets or logs.

## 1. Supabase Auth configuration

1. Set the production Site URL to the canonical HTTPS application URL.
2. Add only the required local and production callback URLs. Confirm an unlisted redirect is rejected.
3. Enable passwordless email sign-in and account creation.
4. Enable hCaptcha, store the hCaptcha secret in Supabase, and place only the site key in `VITE_HCAPTCHA_SITE_KEY`.
5. Configure custom SMTP with a verified no-reply sender domain.
6. Configure email, OTP, and signup rate limits for expected traffic.
7. Customize the magic-link template without exposing whether an address already has an account.
8. Test delivery and callback behavior for one new and one returning test account.

## 2. Database and Edge Function release

Apply migrations in timestamp order, then run the database tests:

```bash
supabase db push
supabase test db
```

Configure server-only secrets and deploy with JWT verification enabled:

```bash
supabase secrets set \
  N8N_MEAL_WEBHOOK_URL="https://YOUR_N8N_HOST/webhook/NEW_UNGUESSABLE_PATH" \
  N8N_WEBHOOK_SECRET="YOUR_RANDOM_32_BYTE_OR_LONGER_SECRET" \
  ALLOWED_ORIGINS="http://localhost:5173,https://YOUR_PRODUCTION_DOMAIN"

supabase functions deploy analyze-meal
```

Do not set the n8n URL, n8n secret, SMTP credentials, service-role key, or AI credentials as `VITE_*` variables.

## 3. n8n cutover

Follow [the protected Webhook procedure](../n8n/PROTECTED_WEBHOOK.md). Verify missing and incorrect secrets are rejected at the Webhook node before paid nodes execute. Keep the old route active only until the protected end-to-end smoke test passes, then disable it immediately.

## 4. Production acceptance

Use a fresh test account and record only request IDs and status codes.

- Signed-out upload and camera controls are unavailable.
- A valid email plus CAPTCHA gives the same confirmation for new and existing addresses.
- Valid link login survives refresh; expired/reused links show a recoverable message.
- Invalid, empty, unsupported, oversized, and malformed uploads do not change quota.
- JPEG, PNG, and WebP uploads succeed.
- The first three accepted scans leave two, one, and zero scans.
- The fourth request returns `429` and creates no n8n execution.
- Four concurrent RPC attempts accept no more than the available allowance.
- n8n timeout or invalid output returns `502` and does not refund an already consumed scan.
- Logout clears results and quota; a revoked token causes `401` and returns to sign-in.
- The old public n8n route is unavailable.
- Built browser assets contain no n8n host, path, secret, service-role key, SMTP credential, or AI credential.

## 5. Monitoring

Alert on Auth email failures, unusual signup or scan volume, CAPTCHA failure spikes, Edge Function `401`, `500`, and `502` rates, function and n8n latency, n8n execution failures, and unexpected quota-table growth. Treat ordinary `429` responses as expected quota enforcement unless volume suggests abuse.

Logs may contain request ID, a non-display user identifier, status, quota decision, duration, and upstream outcome category. Logs must never contain tokens, email addresses, magic-link URLs, CAPTCHA tokens, secrets, raw images, or complete request bodies.

## 6. Rotation and emergency shutdown

To rotate the Webhook secret, create a new n8n Header Auth credential, update `N8N_WEBHOOK_SECRET`, deploy/test the Edge Function, then remove the old credential. Rotate immediately after suspected exposure.

If n8n or paid processing is unstable, unset or replace `N8N_MEAL_WEBHOOK_URL` with no public fallback. The Edge Function will return a configuration error while authentication remains available. Roll back frontend and Edge Function deployments independently, but never restore a frontend containing direct n8n access and never delete quota history to roll back a migration.
