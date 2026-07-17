const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_TEST_ACCESS_TOKEN"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const rpc = async (name, body = {}) => {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_TEST_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}`);
  return Array.isArray(payload) ? payload[0] : payload;
};

const before = await rpc("get_scan_quota");
const expectedAccepted = Math.min(3, Number(before.remaining));
const attempts = await Promise.all(
  Array.from({ length: 4 }, () => rpc("consume_scan_quota", { p_request_id: crypto.randomUUID() })),
);
const accepted = attempts.filter((attempt) => attempt.allowed).length;
const after = await rpc("get_scan_quota");

if (accepted !== expectedAccepted || Number(after.remaining) !== Number(before.remaining) - accepted) {
  console.error({ before, attempts, after });
  throw new Error("Concurrent quota enforcement failed");
}

console.log(`Concurrency check passed: ${accepted} accepted, ${4 - accepted} rejected.`);
