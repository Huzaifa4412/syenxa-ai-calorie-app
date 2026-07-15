import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type QuotaRow = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  reset_at: string | null;
};

const getAllowedOrigins = () => {
  const configured = Deno.env.get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length
    ? configured
    : ["http://localhost:5173", "http://127.0.0.1:5173"];
};

const corsHeaders = (origin: string | null) => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return headers;
};

const json = (body: unknown, status: number, origin: string | null) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  },
);

const normalizeQuota = (row: QuotaRow) => ({
  limit: Number(row.limit),
  used: Number(row.used),
  remaining: Number(row.remaining),
  resetAt: row.reset_at,
});

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();

  if (origin && !allowedOrigins.includes(origin)) {
    return json({ error: "Origin not allowed." }, 403, null);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const n8nWebhookUrl = Deno.env.get("N8N_MEAL_WEBHOOK_URL");
  const n8nWebhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET");

  if (!supabaseUrl || !supabaseAnonKey || !n8nWebhookUrl || !n8nWebhookSecret) {
    return json({ error: "Server configuration is incomplete." }, 500, origin);
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Authentication required." }, 401, origin);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return json({ error: "Your session has expired. Sign in again." }, 401, origin);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Upload a valid multipart form." }, 400, origin);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ error: "A meal image is required." }, 400, origin);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return json({ error: "Only JPG, PNG, and WEBP images are supported." }, 415, origin);
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return json({ error: "The image must be smaller than 10 MB." }, 413, origin);
  }

  const { data: quotaData, error: quotaError } = await supabase.rpc("consume_scan_quota", {
    p_request_id: crypto.randomUUID(),
  });

  if (quotaError) {
    return json({ error: "We couldn't verify your scan allowance." }, 500, origin);
  }

  const quotaRow = (Array.isArray(quotaData) ? quotaData[0] : quotaData) as QuotaRow | undefined;
  if (!quotaRow) return json({ error: "We couldn't verify your scan allowance." }, 500, origin);

  const quota = normalizeQuota(quotaRow);
  if (!quotaRow.allowed) {
    return json({ error: "Your three free scans are used. Wait for the next scan to reset.", quota }, 429, origin);
  }

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name);

  let upstream: Response;
  try {
    upstream = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "X-Syenxa-Calories-Webhook-Secret": n8nWebhookSecret },
      body: upstreamForm,
    });
  } catch {
    return json({ error: "The analysis service is temporarily unavailable.", quota }, 502, origin);
  }

  const upstreamPayload = await upstream.json().catch(() => null);
  if (!upstream.ok || !upstreamPayload) {
    return json({ error: "The analysis service could not process this meal.", quota }, 502, origin);
  }

  return json({ output: upstreamPayload.output ?? null, quota }, 200, origin);
});
