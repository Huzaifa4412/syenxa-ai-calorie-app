import type { AnalysisResponse, ScanQuota } from "../types";
import { getSupabaseConfig } from "./supabase";

type ErrorPayload = {
  error?: string;
  quota?: ScanQuota;
};

export class AnalysisApiError extends Error {
  status: number;
  quota?: ScanQuota;

  constructor(message: string, status: number, quota?: ScanQuota) {
    super(message);
    this.name = "AnalysisApiError";
    this.status = status;
    this.quota = quota;
  }
}

export const analyzeMeal = async (file: File): Promise<AnalysisResponse> => {
  const { supabase, supabaseUrl, supabasePublishableKey } = getSupabaseConfig();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) throw new AnalysisApiError("Your session has expired. Sign in again.", 401);

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${supabaseUrl}/functions/v1/analyze-meal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
    },
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as AnalysisResponse & ErrorPayload;

  if (!response.ok) {
    throw new AnalysisApiError(
      payload.error || "Meal analysis failed. Please try again.",
      response.status,
      payload.quota,
    );
  }

  return payload;
};
