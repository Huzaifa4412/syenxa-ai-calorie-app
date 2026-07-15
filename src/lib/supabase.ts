import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isSupabaseConfigured = supabase !== null;

export const getSupabaseConfig = () => {
  if (!supabase || !supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase is not configured. Add the required Vite environment variables.");
  }

  return { supabase, supabaseUrl, supabasePublishableKey };
};
