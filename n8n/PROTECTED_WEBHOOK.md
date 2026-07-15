# Protect the Syenxa Calories n8n workflow

The browser no longer calls n8n directly. The `analyze-meal` Supabase Edge Function is the only permitted caller.

## Update the existing Webhook node

1. Open the existing meal-analysis workflow and duplicate it before editing.
2. Change the Webhook path from `meal-ai` to a new path, such as `syenxa-calories-meal-analysis-v1`.
3. Set **HTTP Method** to `POST` and keep the existing binary file field named `file`.
4. Set **Authentication** to `Header Auth`.
5. Create an n8n Header Auth credential named `Syenxa Calories Edge Gateway`:
   - Header name: `X-Syenxa-Calories-Webhook-Secret`
   - Header value: a new random secret of at least 32 bytes
6. Select that credential on the Webhook node.
7. Leave every downstream meal-analysis node and response mapping unchanged.
8. Activate the updated workflow, copy its production webhook URL, and set it as the Edge Function secret `N8N_MEAL_WEBHOOK_URL`.
9. Set the identical header value as the Edge Function secret `N8N_WEBHOOK_SECRET`.
10. Disable the old `/webhook/meal-ai` production route. Do not leave an unauthenticated copy active.

## Verification

- A POST without `X-Syenxa-Calories-Webhook-Secret` must be rejected before any AI node executes.
- A POST with the wrong value must also be rejected before any paid node executes.
- A valid request from the Supabase Edge Function must preserve the existing response shape: `{ "output": ... }`.
- Confirm the n8n execution log shows no paid-node executions for rejected requests.

Header authentication belongs on the Webhook node itself. A later IF or Code node is too late because it starts a workflow execution and is easier to wire incorrectly.
