# Syenxa Calories meal scanner

Syenxa Calories turns a meal photo into a calorie and macro breakdown. Users must sign in and receive three free analyses during any rolling 24-hour period.

## Architecture

```text
React app
  -> Supabase Auth (email magic link)
  -> Supabase Edge Function (JWT, file validation, quota)
  -> protected n8n webhook (secret header)
  -> existing meal-analysis nodes
```

The n8n URL and webhook secret never enter the browser bundle. Quota is consumed atomically immediately before the Edge Function calls n8n.

## Local setup

Requirements: Node.js, a Supabase project, and access to the existing n8n workflow.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and provide:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
   VITE_HCAPTCHA_SITE_KEY=YOUR_HCAPTCHA_SITE_KEY
   ```

3. Apply the migration in `supabase/migrations` with the Supabase CLI or SQL editor.

4. In Supabase Auth:

   - Enable email magic-link sign-in.
   - Add the local and production site URLs to allowed redirect URLs.
   - Enable hCaptcha and configure its secret key.
   - Configure custom SMTP, a verified no-reply sender, and production Auth rate limits.

5. Protect and rotate the n8n webhook using [n8n/PROTECTED_WEBHOOK.md](n8n/PROTECTED_WEBHOOK.md).

6. Configure and deploy the Edge Function:

   ```bash
   supabase secrets set \
     N8N_MEAL_WEBHOOK_URL="https://YOUR_N8N_HOST/webhook/NEW_PATH" \
     N8N_WEBHOOK_SECRET="YOUR_RANDOM_SERVER_SECRET" \
     ALLOWED_ORIGINS="http://localhost:5173,https://YOUR_PRODUCTION_DOMAIN"

   supabase functions deploy analyze-meal
   ```

   `SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied by the Supabase Functions runtime.

7. Start the app:

   ```bash
   npm run dev
   ```

## Quota behavior

- Limit: 3 accepted scans per authenticated user.
- Window: rolling 24 hours, based on each scan timestamp.
- Invalid file types, files over 10 MB, and unauthenticated requests do not consume quota.
- Quota is consumed before the paid AI workflow begins. Upstream failures after that point still count.
- The database function takes a per-user transaction lock, so concurrent uploads cannot exceed the limit.

## Security notes

- Never add the n8n URL, webhook secret, Supabase service-role key, or AI credentials to `VITE_*` variables.
- `verify_jwt = true` in `supabase/config.toml` rejects unauthenticated function calls at the platform boundary. The handler also resolves the bearer token with `auth.getUser()` before validation, quota, or n8n work.
- The usage table has RLS enabled and no direct browser table permissions. Authenticated users can only use the controlled quota functions.
- Disable the original public n8n webhook before release.

## Checks

```bash
npm run lint
npm run build
npm audit
```

Run database tests with `supabase test db`. To exercise the advisory lock against a deployed test project, provide a fresh authenticated test account and run:

```bash
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_PUBLISHABLE_KEY="YOUR_PUBLISHABLE_KEY" \
SUPABASE_TEST_ACCESS_TOKEN="TEST_USER_ACCESS_TOKEN" \
npm run test:quota:concurrency
```

See [docs/AUTHENTICATION_OPERATIONS.md](docs/AUTHENTICATION_OPERATIONS.md) for production configuration, smoke tests, monitoring, rotation, and rollback.
