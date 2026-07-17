# Authentication Implementation Plan

> **Project:** Syenxa AI Calorie App  
> **Status:** Ready for implementation  
> **Purpose:** Single source of truth for authentication, trial quota, Supabase, Edge Function, and n8n work.

## 1. Objective

Implement secure authentication and trial enforcement with these locked requirements:

- Users must authenticate before scanning a meal.
- Authentication uses Supabase passwordless email magic links.
- Each Supabase account receives three meal analyses in a rolling 24-hour window.
- Each consumed scan becomes available again exactly 24 hours after it was used.
- Invalid uploads do not consume a trial.
- A trial is consumed immediately before the paid n8n workflow starts.
- A failure after n8n starts still consumes the trial.
- Postgres is the quota source of truth.
- The browser must never call n8n directly.
- The n8n URL, webhook secret, SMTP credentials, service-role key, and AI credentials must remain server-only.

## 2. Agent Coordination Protocol

Every agent working on authentication-related code must follow this document.

### Coordination rules

1. Read this document before changing authentication, quota, Edge Function, or n8n behavior.
2. Check the task board and dependencies before starting.
3. Claim only one unassigned task at a time unless explicitly coordinating parallel work.
4. Record the agent name and UTC start time beside the claimed task.
5. Do not change files owned by another active task without coordinating first.
6. Update shared contracts here before implementing a breaking interface change.
7. Run the verification listed for the task before marking it complete.
8. Record changed files, test results, limitations, and the recommended next task in the handoff log.
9. Do not rewrite an applied Supabase migration; add a new migration.
10. Never store credentials, tokens, magic links, SMTP passwords, or webhook secrets in this file.

### Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed and verified
- `[!]` Blocked
- `[-]` Intentionally skipped

### Ownership format

When starting:

```text
[~] AUTH-001 — Owner: <agent-name> — Started: <UTC timestamp>
```

When completed:

```text
[x] AUTH-001 — Owner: <agent-name> — Verified: <UTC timestamp>
```

### System ownership boundaries

- **Frontend:** React authentication, session state, quota UI, uploads, and browser error handling.
- **Database:** Migrations, RLS, grants, RPC functions, concurrency, and quota data integrity.
- **Edge Function:** JWT verification, file validation, quota consumption, n8n proxying, and API responses.
- **n8n:** Protected Webhook configuration, workflow execution, and response mapping.
- **Release:** Supabase dashboard configuration, secrets, deployment, monitoring, and rollback.

## 3. Task Board

| ID | Task | Owner | Status | Dependencies |
|---|---|---|---|---|
| AUTH-001 | Remove the direct browser-to-n8n bypass | Codex | `[x]` | None |
| AUTH-002 | Harden the Supabase client and session lifecycle | Codex | `[~]` | AUTH-001 |
| AUTH-003 | Complete magic-link UI, CAPTCHA, and callback states | Codex | `[~]` | AUTH-002 |
| AUTH-004 | Harden quota migration, RPC grants, and RLS | Codex | `[~]` | None |
| AUTH-005 | Add database authorization and concurrency tests | Codex | `[~]` | AUTH-004 |
| AUTH-006 | Enable and verify Edge Function JWT enforcement | Codex | `[~]` | AUTH-004 |
| AUTH-007 | Harden server-side upload validation and errors | Codex | `[~]` | AUTH-006 |
| AUTH-008 | Complete atomic quota-to-n8n request flow | Codex | `[~]` | AUTH-005, AUTH-007 |
| AUTH-009 | Protect the n8n Webhook with Header Auth | Environment owner | `[!]` | None |
| AUTH-010 | Connect the Edge Function to protected n8n | Codex / environment owner | `[~]` | AUTH-008, AUTH-009 |
| AUTH-011 | Complete frontend quota and exhausted states | Codex | `[~]` | AUTH-003, AUTH-008 |
| AUTH-012 | Configure Auth URLs, CAPTCHA, SMTP, and rate limits | Environment owner | `[!]` | AUTH-003 |
| AUTH-013 | Run end-to-end authentication and quota tests | Environment owner | `[!]` | AUTH-010, AUTH-011, AUTH-012 |
| AUTH-014 | Disable the old public n8n route | Environment owner | `[!]` | AUTH-013 |
| AUTH-015 | Deploy and run production smoke tests | Environment owner | `[!]` | AUTH-014 |
| AUTH-016 | Verify monitoring, rotation, and rollback procedures | Environment owner | `[!]` | AUTH-015 |

## 4. Current-State Audit

The repository already contains much of the intended foundation:

- Supabase browser client configuration.
- React authentication context and session listener.
- Email magic-link form.
- Quota display and exhausted state.
- `scan_usage` migration.
- `get_scan_quota()` and `consume_scan_quota()` RPC functions.
- Supabase `analyze-meal` Edge Function.
- Documentation for protecting the n8n Webhook.

### Critical authentication bypass

The frontend currently defines a fallback production n8n URL and derives `directN8nMode` from it. Because the fallback is always non-empty, `directN8nMode` is always true. This causes the application to:

- bypass authentication checks;
- bypass quota checks;
- skip Supabase quota loading;
- call n8n directly from the browser;
- expose a public production Webhook path.

Removing this bypass is the first frontend task.

### Baseline verification

At the time this plan was created:

- `npm run lint` passed.
- `npm run build` passed.

These commands remain required regression gates throughout implementation.

## 5. Target Architecture

```text
React/Vite application
  → Supabase Auth magic link
  → authenticated Supabase browser session
  → POST image to Supabase analyze-meal Edge Function
      → validate JWT and resolve user
      → validate multipart image
      → atomically consume Postgres quota
      → send image to protected n8n Webhook
  → n8n meal-analysis workflow
  → nutrition result plus updated quota
  → React result interface
```

### Security boundaries

- React controls presentation, not authorization.
- Supabase Auth establishes the account identity.
- Postgres determines whether a scan is allowed.
- The Edge Function is the only permitted n8n caller.
- n8n authenticates the Edge Function before paid nodes execute.
- CORS is defense-in-depth and never replaces JWT validation.

## 6. Shared Contracts

Changes to this section must be coordinated with every dependent task.

### Authentication contract

- Provider: Supabase Auth
- Method: passwordless email magic link
- Account creation: allowed during OTP sign-in
- CAPTCHA: hCaptcha in production
- Browser session: persisted and automatically refreshed
- Server verification: platform JWT verification plus `auth.getUser()`

### Quota contract

- Limit: `3`
- Window: rolling 24 hours
- Reset: one scan returns at a time
- Invalid upload: not consumed
- Consumption point: immediately before calling n8n
- Failure after n8n starts: consumed
- Scope: per Supabase user account

### TypeScript contracts

```ts
type ScanQuota = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
};

type AnalysisResponse = {
  output: MealAnalysis | null;
  quota: ScanQuota;
};

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  sendMagicLink(email: string, captchaToken: string): Promise<void>;
  signOut(): Promise<void>;
};
```

### Edge Function response contract

Success:

```json
{
  "output": {},
  "quota": {
    "limit": 3,
    "used": 1,
    "remaining": 2,
    "resetAt": "ISO-8601 timestamp"
  }
}
```

Quota exhausted:

```json
{
  "error": "Your three free scans are used.",
  "quota": {
    "limit": 3,
    "used": 3,
    "remaining": 0,
    "resetAt": "ISO-8601 timestamp"
  }
}
```

### Protected n8n request contract

- Method: `POST`
- Body: multipart form data
- Image field: `file`
- Authentication header: `X-Syenxa-Calories-Webhook-Secret`
- Success response: `{ "output": ... }`

## 7. Implementation Tasks

### AUTH-001 — Remove the direct n8n bypass

**Status:** `[x]`  
**Owner:** Codex  
**Dependencies:** None  
**Primary file:** `src/components/upload-files.tsx`

#### Checklist

- [ ] Remove the hard-coded n8n Webhook fallback.
- [ ] Remove `VITE_N8N_MEAL_WEBHOOK_URL` from frontend code and `.env.example`.
- [ ] Remove `directN8nMode`.
- [ ] Remove direct browser `fetch()` calls to n8n.
- [ ] Remove direct Webhook payload normalization types and helpers.
- [ ] Make `analyzeMeal(file)` the only analysis entrypoint.
- [ ] Require an authenticated user before opening upload/camera actions.
- [ ] Preserve existing image preparation and nutrition rendering.

#### Verification

- [ ] Search the repository for the old public Webhook URL.
- [ ] Confirm built JavaScript contains no n8n hostname or Webhook path.
- [ ] Confirm signed-out uploads are blocked.
- [ ] Run lint and build.

### AUTH-002 — Harden the Supabase session lifecycle

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** AUTH-001  
**Primary files:** `src/lib/supabase.ts`, `src/auth/auth-context.tsx`

#### Checklist

- [ ] Keep one shared Supabase browser client.
- [ ] Preserve session persistence and automatic token refresh.
- [ ] Restore the existing session during startup.
- [ ] Subscribe to `onAuthStateChange` once.
- [ ] Unsubscribe during provider cleanup.
- [ ] Expose loading, session, user, magic-link, and logout state.
- [ ] Clear protected UI state after logout.
- [ ] Handle session initialization errors without exposing internals.
- [ ] Handle expired or revoked sessions consistently.

#### Verification

- [ ] Refreshing preserves a valid session.
- [ ] Logout returns immediately to the authentication gate.
- [ ] An expired token causes the next protected request to return `401`.
- [ ] React Strict Mode does not leave duplicate listeners.

### AUTH-003 — Complete magic-link and CAPTCHA UX

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** AUTH-002  
**Primary file:** `src/components/auth-panel.tsx`

#### Checklist

- [ ] Validate and normalize the email address.
- [ ] Call `signInWithOtp` with `shouldCreateUser: true`.
- [ ] Use an allow-listed application callback URL.
- [ ] Add hCaptcha to the form.
- [ ] Require a CAPTCHA token before submission in production.
- [ ] Pass the token through `sendMagicLink`.
- [ ] Reset CAPTCHA after submission or failure.
- [ ] Disable duplicate submissions while pending.
- [ ] Show a generic link-sent confirmation.
- [ ] Add safe states for expired, invalid, or reused links.
- [ ] Do not reveal whether an email already has an account.

#### Verification

- [ ] New and existing emails receive the same confirmation UI.
- [ ] Missing CAPTCHA is blocked.
- [ ] Valid magic link establishes a session.
- [ ] Expired magic link displays a recoverable error.
- [ ] Auth rate-limit errors do not crash the application.

### AUTH-004 — Harden the quota database

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** None  
**Primary path:** `supabase/migrations/`

#### Required schema

```sql
public.scan_usage
- id uuid primary key
- request_id uuid unique not null
- user_id uuid not null references auth.users(id) on delete cascade
- created_at timestamptz not null default now()
```

#### Checklist

- [ ] Confirm the table and user/timestamp index exist.
- [ ] Enable RLS.
- [ ] Revoke direct table access from `anon` and `authenticated`.
- [ ] Keep `get_scan_quota()` as a stable `SECURITY DEFINER` function.
- [ ] Keep `consume_scan_quota(uuid)` as a volatile `SECURITY DEFINER` function.
- [ ] Require `auth.uid()` in both functions.
- [ ] Use a controlled empty `search_path` and schema-qualified objects.
- [ ] Revoke RPC execution from `public` and `anon`.
- [ ] Grant required RPC execution only to `authenticated`.
- [ ] Keep the per-user transaction advisory lock.
- [ ] Add a follow-up migration if the existing migration was applied remotely.

#### Required behavior

- [ ] Count only records newer than `now() - interval '24 hours'`.
- [ ] Return limit, used, remaining, and the next reset time.
- [ ] Reject the fourth active scan.
- [ ] Insert exactly one usage record for each accepted attempt.
- [ ] Return post-consumption quota.

### AUTH-005 — Test database authorization and concurrency

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** AUTH-004

#### Checklist

- [ ] Confirm anonymous RPC calls fail.
- [ ] Confirm unauthenticated quota consumption fails.
- [ ] Confirm direct select, insert, update, and delete fail for browser roles.
- [ ] Confirm a new user receives three scans.
- [ ] Confirm three accepted requests consume all scans.
- [ ] Confirm the fourth request is rejected.
- [ ] Confirm separate users have separate allowances.
- [ ] Send four concurrent requests for one user.
- [ ] Confirm no more than three usage rows are inserted.
- [ ] Confirm one scan returns when the oldest usage reaches 24 hours.

### AUTH-006 — Enforce Edge Function authentication

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** AUTH-004  
**Primary files:** `supabase/config.toml`, `supabase/functions/analyze-meal/index.ts`

#### Checklist

- [ ] Enable platform JWT verification for `analyze-meal`.
- [ ] Require a bearer token.
- [ ] Resolve the current user using `auth.getUser()`.
- [ ] Return `401` for missing, malformed, expired, or revoked sessions.
- [ ] Use a caller-scoped Supabase client for RPC calls.
- [ ] Do not use the service-role key for normal quota operations.
- [ ] Keep `OPTIONS` preflight handling compatible with the browser.

#### Verification

- [ ] Missing JWT is rejected before file parsing or database work.
- [ ] Forged JWT is rejected.
- [ ] Expired JWT is rejected.
- [ ] Valid authenticated request reaches validation.

### AUTH-007 — Harden upload validation and errors

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** AUTH-006

#### Checklist

- [ ] Accept only `POST` and `OPTIONS`.
- [ ] Enforce the configured browser-origin allowlist.
- [ ] Parse multipart requests safely.
- [ ] Require exactly one `file` field.
- [ ] Allow JPEG, PNG, and WebP.
- [ ] Reject empty files.
- [ ] Enforce the final server-side file-size limit.
- [ ] Complete validation before consuming quota.
- [ ] Return JSON errors without stack traces or configuration details.

#### Status contract

| Status | Meaning |
|---|---|
| `200` | Analysis completed |
| `400` | Invalid request or missing file |
| `401` | Authentication required or expired |
| `403` | Browser origin rejected |
| `405` | Unsupported method |
| `413` | File too large |
| `415` | Unsupported image type |
| `429` | Quota exhausted |
| `500` | Database or server configuration failure |
| `502` | n8n unavailable or invalid response |

### AUTH-008 — Complete atomic quota consumption

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** AUTH-005, AUTH-007

#### Checklist

- [ ] Generate a server-side request UUID.
- [ ] Call `consume_scan_quota` after authentication and file validation.
- [ ] Return `429` with quota when consumption is denied.
- [ ] Do not call n8n after quota denial.
- [ ] Consume immediately before n8n execution.
- [ ] Include updated quota in success responses.
- [ ] Include quota in upstream errors occurring after consumption.
- [ ] Do not refund attempts after n8n starts.

### AUTH-009 — Protect the n8n Webhook

**Status:** `[!]`  
**Owner:** Environment owner  
**Dependencies:** None  
**External system:** n8n

#### Checklist

- [ ] Duplicate the existing workflow before editing production.
- [ ] Create a new unguessable Webhook path.
- [ ] Configure `POST` with binary field `file`.
- [ ] Add Header Auth to the Webhook node.
- [ ] Use `X-Syenxa-Calories-Webhook-Secret`.
- [ ] Generate a random secret of at least 32 bytes.
- [ ] Store it in n8n credentials, never workflow parameters.
- [ ] Preserve downstream meal-analysis nodes.
- [ ] Preserve the `{ "output": ... }` response shape.
- [ ] Configure synchronous final-result response behavior.
- [ ] Confirm missing and incorrect secrets fail before paid nodes.

### AUTH-010 — Connect the Edge Function to n8n

**Status:** `[~]`  
**Owner:** Codex / environment owner  
**Dependencies:** AUTH-008, AUTH-009

#### Checklist

- [ ] Store the protected Webhook URL as `N8N_MEAL_WEBHOOK_URL`.
- [ ] Store the header secret as `N8N_WEBHOOK_SECRET`.
- [ ] Forward only the validated image.
- [ ] Add the authentication header.
- [ ] Add a bounded upstream timeout.
- [ ] Validate the upstream HTTP status.
- [ ] Validate JSON and nutrition-result shape.
- [ ] Return `502` for timeout, network failure, or invalid output.
- [ ] Confirm failures after n8n starts remain consumed.

### AUTH-011 — Complete quota UI behavior

**Status:** `[~]`  
**Owner:** Codex  
**Dependencies:** AUTH-003, AUTH-008

#### Checklist

- [ ] Load `get_scan_quota` after authentication.
- [ ] Disable scanning while quota is loading.
- [ ] Display remaining scans from the server response.
- [ ] Update quota after every analysis response.
- [ ] Display the next rolling reset time.
- [ ] Refresh exhausted-state time copy periodically.
- [ ] Handle `401` by clearing the invalid session.
- [ ] Handle `429` by preserving returned quota.
- [ ] Prevent duplicate submission while analysis runs.
- [ ] Clear meal and quota state after logout.

### AUTH-012 — Configure production authentication

**Status:** `[!]`  
**Owner:** Environment owner  
**Dependencies:** AUTH-003  
**External system:** Supabase dashboard and email provider

#### Checklist

- [ ] Configure the production site URL.
- [ ] Configure local and production redirect URLs.
- [ ] Enable passwordless email authentication.
- [ ] Customize the magic-link template.
- [ ] Enable hCaptcha.
- [ ] Configure email and OTP rate limits.
- [ ] Configure production custom SMTP.
- [ ] Use a verified no-reply sender domain.
- [ ] Test new-user and returning-user delivery.
- [ ] Confirm invalid redirects are rejected.

## 8. Environment and Secret Inventory

### Browser environment

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_HCAPTCHA_SITE_KEY=
```

### Edge Function secrets

```env
N8N_MEAL_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
ALLOWED_ORIGINS=
```

### Secret checklist

- [ ] No service-role key in frontend files.
- [ ] No n8n URL or secret in browser variables.
- [ ] No SMTP or AI credentials in the repository.
- [ ] `.env.local` remains ignored.
- [ ] `.env.example` contains placeholders only.
- [ ] Development and production secrets are different.
- [ ] Logs contain no tokens, emails, secrets, or image bodies.

## 9. End-to-End Test Matrix

### Authentication

- [ ] Signed-out visitor can view public content but cannot scan.
- [ ] Valid email and CAPTCHA sends a magic link.
- [ ] Missing or invalid CAPTCHA is rejected.
- [ ] New and existing accounts receive non-enumerating UI responses.
- [ ] Valid callback establishes a session.
- [ ] Expired callback displays a recoverable error.
- [ ] Refresh preserves a valid session.
- [ ] Logout clears protected state.
- [ ] Revoked session produces `401` and returns to sign-in.

### Quota

- [ ] New user sees three available scans.
- [ ] First accepted scan leaves two.
- [ ] Second accepted scan leaves one.
- [ ] Third accepted scan leaves zero.
- [ ] Fourth scan returns `429` and does not execute n8n.
- [ ] Exactly one scan returns when the oldest usage reaches 24 hours.
- [ ] Different users receive independent quotas.
- [ ] Four concurrent requests cannot create more than three active records.

### Upload validation

- [ ] Valid JPEG succeeds.
- [ ] Valid PNG succeeds.
- [ ] Valid WebP succeeds.
- [ ] Unsupported type returns `415` without consumption.
- [ ] Oversized file returns `413` without consumption.
- [ ] Empty file is rejected without consumption.
- [ ] Missing file is rejected without consumption.
- [ ] Malformed multipart input is rejected without consumption.

### n8n and upstream failures

- [ ] Missing Webhook secret is rejected before paid nodes.
- [ ] Incorrect Webhook secret is rejected before paid nodes.
- [ ] Valid Edge Function request succeeds.
- [ ] n8n timeout returns `502` and the trial remains consumed.
- [ ] Invalid n8n output returns `502` and the trial remains consumed.
- [ ] Rejected Webhook requests do not appear as paid executions.

### Regression and security commands

```bash
npm run lint
npm run build
npm audit
```

- [ ] Lint passes.
- [ ] TypeScript compilation passes.
- [ ] Production build passes.
- [ ] Built assets contain no n8n hostname, path, or secret.
- [ ] Repository search finds no committed private credential.

## 10. Deployment Checklist

Deploy in this order:

1. Configure Supabase Auth, CAPTCHA, URLs, rate limits, and SMTP.
2. Apply and verify database migrations.
3. Create the protected n8n Webhook.
4. Store Edge Function secrets.
5. Deploy and test the Edge Function.
6. Deploy the frontend without direct n8n mode.
7. Run authentication and quota smoke tests.
8. Disable the old public n8n route.
9. Monitor the first production executions.

### Production acceptance

- [ ] Production magic links arrive and redirect correctly.
- [ ] CAPTCHA works on the production domain.
- [ ] Allowed origins include only intended environments.
- [ ] Three scans succeed for a fresh test account.
- [ ] The fourth scan returns `429`.
- [ ] Logout and session expiry work.
- [ ] Protected n8n calls succeed.
- [ ] Old public n8n path is unavailable.
- [ ] Browser bundle exposes no private values.

## 11. Monitoring and Operations

### Permitted logs

- request ID;
- non-display user identifier;
- response status;
- quota allowed/denied outcome;
- Edge Function duration;
- n8n duration;
- upstream success/failure category.

### Prohibited logs

- access or refresh tokens;
- magic-link URLs;
- email addresses;
- CAPTCHA tokens;
- Webhook secrets;
- raw images;
- complete private request bodies.

### Monitoring checklist

- [ ] Monitor Auth email failures.
- [ ] Monitor unusual signup and scan volume.
- [ ] Monitor CAPTCHA failure rates.
- [ ] Monitor Edge Function `401`, `500`, and `502` rates.
- [ ] Treat `429` as expected unless volume indicates abuse.
- [ ] Monitor Edge Function and n8n latency.
- [ ] Monitor n8n execution failures.
- [ ] Monitor quota-table growth.
- [ ] Document secret rotation.
- [ ] Document emergency analysis shutdown and rollback.

## 12. Rollback Plan

- Keep the previous frontend deployment available for platform rollback, but never restore a build containing the public direct-n8n bypass.
- Roll back Edge Function code independently if a server regression occurs.
- Do not roll back database migrations by deleting recorded usage.
- If n8n is unstable, disable analysis at the Edge Function while leaving authentication operational.
- If email delivery fails, show a temporary authentication-service message rather than exposing direct analysis access.
- Rotate the n8n secret if it is exposed and update both n8n credentials and Supabase secrets before re-enabling analysis.

## 13. Definition of Done

- [ ] Authentication is required before every scan.
- [ ] Magic-link authentication works in development and production.
- [ ] CAPTCHA and Auth rate limits are enabled.
- [ ] The browser cannot call n8n directly.
- [ ] Postgres enforces three rolling scans per account.
- [ ] Concurrent requests cannot exceed the quota.
- [ ] Invalid files do not consume trials.
- [ ] Attempts reaching paid processing consume trials.
- [ ] Users see remaining scans and the next reset time.
- [ ] RLS, grants, and RPC permissions are verified.
- [ ] The n8n Webhook rejects unauthorized requests before paid nodes.
- [ ] The old public n8n route is disabled.
- [ ] Lint, build, database, integration, and production smoke tests pass.
- [ ] All secrets remain server-only.
- [ ] Monitoring, rotation, and rollback procedures are verified.

## 14. Assumptions and Out-of-Scope Items

- The free allowance repeats indefinitely using a rolling 24-hour window.
- The limit applies per Supabase account, not per verified human, household, device, or IP.
- Payment, subscriptions, premium access, and administrative quota overrides are outside this implementation.
- Usage history remains available for auditing but is not exposed beyond current quota and reset time.
- hCaptcha is the default production CAPTCHA provider.
- Custom SMTP is required for production email reliability.

## 15. Agent Handoff Log

Append entries; do not rewrite earlier handoffs.

| UTC Time | Agent | Task | Files or systems changed | Verification | Result / Next task |
|---|---|---|---|---|---|
| 2026-07-15T18:51:05Z | Codex | AUTH-001–AUTH-016 implementation pass | Frontend, migrations/tests, Edge Function, docs, plan | `npm run lint`; `npm run build`; `npm audit`; source and bundle secret scans | Local implementation passed. Dashboard, protected n8n credential, deployed database/function tests, cutover, and production smoke tests require environment access; follow `docs/AUTHENTICATION_OPERATIONS.md`. |

### Handoff template

```md
### <UTC timestamp> — <agent name> — <task ID>

- Status:
- Files changed:
- Database/environment changes:
- Tests executed:
- Test results:
- Known limitations:
- Recommended next task:
```

### 2026-07-15T18:51:05Z — Codex — AUTH-001–AUTH-016 implementation pass

- Status: Local source implementation complete; environment-owned release tasks blocked pending Supabase/n8n access and production credentials.
- Files changed: `.env.example`, `package.json`, `package-lock.json`, `src/auth/*`, `src/components/auth-panel.tsx`, `src/components/upload-files.tsx`, `src/App.css`, `src/vite-env.d.ts`, `supabase/config.toml`, `supabase/functions/analyze-meal/index.ts`, `supabase/migrations/20260715010000_harden_scan_quota_permissions.sql`, `supabase/tests/database/scan_quota.test.sql`, `scripts/test-quota-concurrency.mjs`, `README.md`, `docs/AUTHENTICATION_OPERATIONS.md`, and this plan.
- Database/environment changes: Follow-up migration and tests added but not applied to a remote project. JWT verification enabled in source. No dashboard, secret, SMTP, CAPTCHA, or n8n credential was changed.
- Tests executed: `npm run lint`, `npm run build`, `npm audit`, `npx supabase test db`, repository scan for the old public URL/direct mode, browser-bundle scan for n8n strings, and repository credential-pattern scan.
- Test results: Lint and production build passed; npm reported zero vulnerabilities; no old public URL/direct mode remained outside documentation; no n8n hostname/path/secret appeared in built assets; no committed private credential was found. The database test command could not connect because a local Supabase Postgres instance was not running.
- Known limitations: Database pgTAP and live concurrency require a running local stack or configured test project. Auth delivery/callback, deployed JWT rejection, protected n8n, cutover, monitoring, and production smoke tests require configured external systems.
- Recommended next task: Complete AUTH-009 and AUTH-012, apply migrations/deploy the function, then execute AUTH-013 through AUTH-016 using `docs/AUTHENTICATION_OPERATIONS.md`.
