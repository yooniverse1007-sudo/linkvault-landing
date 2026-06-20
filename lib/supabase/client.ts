import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function hasSupabaseConfig() {
  return supabaseUrl.startsWith("http") && supabaseAnonKey.length > 20;
}

export const supabase = hasSupabaseConfig()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
