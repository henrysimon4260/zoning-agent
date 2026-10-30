import { loadSettings } from "@/lib/settings";

export function supabasePublicConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return { url, key };
  if (typeof window === "undefined") return null;
  const settings = loadSettings();
  if (settings.supabaseUrl.trim() && settings.supabaseKey.trim()) {
    return { url: settings.supabaseUrl.trim(), key: settings.supabaseKey.trim() };
  }
  return null;
}
