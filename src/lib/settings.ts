export type DeskSettings = {
  openaiKey: string;
  openaiModel: string;
  openaiBase: string;
  anthropicKey: string;
  anthropicModel: string;
  tavilyKey: string;
  supabaseUrl: string;
  supabaseKey: string;
};

export const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

const KEY = "lintel.settings.v1";

export function defaultSettings(): DeskSettings {
  return {
    openaiKey: "",
    openaiModel: "gpt-4o-mini",
    openaiBase: process.env.NEXT_PUBLIC_LLM_BASE_URL || DEFAULT_OPENAI_BASE,
    anthropicKey: "",
    anthropicModel: "claude-3-5-haiku-latest",
    tavilyKey: "",
    supabaseUrl: "",
    supabaseKey: "",
  };
}

export function loadSettings(): DeskSettings {
  const base = defaultSettings();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<DeskSettings>) };
  } catch {
    return base;
  }
}

export function saveSettings(settings: DeskSettings): void {
  window.localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("lintel-settings"));
}

export function clearSettings(): void {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("lintel-settings"));
}
