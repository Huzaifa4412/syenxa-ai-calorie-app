import type { ScanQuota } from "../types";
import { getSupabaseConfig } from "./supabase";

type QuotaRow = {
  limit: number;
  used: number;
  remaining: number;
  reset_at: string | null;
};

const normalizeQuota = (row: QuotaRow): ScanQuota => ({
  limit: Number(row.limit),
  used: Number(row.used),
  remaining: Number(row.remaining),
  resetAt: row.reset_at,
});

export const getScanQuota = async (): Promise<ScanQuota> => {
  const { supabase } = getSupabaseConfig();
  const { data, error } = await supabase.rpc("get_scan_quota");

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { limit: 3, used: 0, remaining: 3, resetAt: null };

  return normalizeQuota(row as QuotaRow);
};
