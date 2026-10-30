"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "@/lib/supabase/env";

let browser: SupabaseClient | null = null;

export function resetBrowserSupabase(): void {
  browser = null;
}

export function browserSupabase(): SupabaseClient | null {
  const config = supabasePublicConfig();
  if (!config) return null;
  if (!browser) browser = createBrowserClient(config.url, config.key);
  return browser;
}

export function authConfigured(): boolean {
  return supabasePublicConfig() !== null;
}
