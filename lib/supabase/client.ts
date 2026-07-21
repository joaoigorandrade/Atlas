"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/** Browser Supabase client (singleton under the hood — cheap to call). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
