"use client";

import { useState, type FormEvent } from "react";
import { resetBrowserSupabase } from "@/lib/supabase/client";
import { clearSettings, loadSettings, saveSettings, type DeskSettings } from "@/lib/settings";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<DeskSettings>(() => loadSettings());
  const [saved, setSaved] = useState(false);

  function update<K extends keyof DeskSettings>(key: K, value: DeskSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function persist(event: FormEvent) {
    event.preventDefault();
    saveSettings(settings);
    resetBrowserSupabase();
    setSaved(true);
  }

  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="kicker">This browser</p>
        <h2 id="settings-title">Model and account</h2>
        <p>Keys stay in local storage on this device. They are sent only to the API address you enter, because GitHub Pages has no server of its own. The interview, checklist, and PDF work with the fields left blank.</p>
        <form className="auth-form" onSubmit={persist}>
          <label className="field">
            <span>OpenAI API key</span>
            <input type="password" autoComplete="off" value={settings.openaiKey} onChange={(event) => update("openaiKey", event.target.value)} placeholder="sk-…" />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={settings.openaiModel} onChange={(event) => update("openaiModel", event.target.value)} />
          </label>
          <label className="field">
            <span>OpenAI-compatible endpoint</span>
            <input value={settings.openaiBase} onChange={(event) => update("openaiBase", event.target.value)} />
          </label>
          <label className="field">
            <span>Anthropic API key</span>
            <input type="password" autoComplete="off" value={settings.anthropicKey} onChange={(event) => update("anthropicKey", event.target.value)} placeholder="Used if OpenAI is empty" />
          </label>
          <label className="field">
            <span>Tavily API key</span>
            <input type="password" autoComplete="off" value={settings.tavilyKey} onChange={(event) => update("tavilyKey", event.target.value)} placeholder="Optional ordinance search" />
          </label>
          <label className="field">
            <span>Supabase URL</span>
            <input value={settings.supabaseUrl} onChange={(event) => update("supabaseUrl", event.target.value)} placeholder="https://xxxx.supabase.co" />
          </label>
          <label className="field">
            <span>Supabase publishable key</span>
            <input type="password" autoComplete="off" value={settings.supabaseKey} onChange={(event) => update("supabaseKey", event.target.value)} />
          </label>
          {saved ? <p>Saved on this device.</p> : null}
          <div className="auth-row">
            <button className="solid" type="submit">Save on this device</button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                clearSettings();
                resetBrowserSupabase();
                setSettings(loadSettings());
                setSaved(true);
              }}
            >
              Clear
            </button>
            <button className="ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </form>
      </div>
    </div>
  );
}
