"use client";

import { useState, type FormEvent } from "react";
import { authCallbackUrl } from "@/lib/base-path";
import { browserSupabase } from "@/lib/supabase/client";

export function SaveDialog({
  configured,
  onClose,
  onSignedIn,
}: {
  configured: boolean;
  onClose: () => void;
  onSignedIn: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = browserSupabase();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    const redirect = authCallbackUrl();
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!result.data.session) {
      setMessage("Check your email to confirm the account. This draft stays on the device until you come back and save.");
      return;
    }
    await onSignedIn();
  }

  async function magic() {
    const supabase = browserSupabase();
    if (!supabase || !email) {
      setError("Enter an email for the magic link.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: magicError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authCallbackUrl() },
    });
    setBusy(false);
    if (magicError) setError(magicError.message);
    else setMessage("Magic link sent. The draft stays on this device until you open the link and save.");
  }

  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title" onMouseDown={(event) => event.stopPropagation()}>
        <p className="kicker">Save</p>
        <h2 id="save-title">Keep this project</h2>
        {configured ? (
          <>
            <p>Your work is already on this device. An account is only for keeping it after you leave, and for the project list on other machines.</p>
            <form className="auth-form" onSubmit={submit}>
              <label className="field">
                <span>Email</span>
                <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              {error ? <p className="error">{error}</p> : null}
              {message ? <p>{message}</p> : null}
              <div className="auth-row">
                <button className="solid" type="submit" disabled={busy}>{busy ? "Working…" : mode === "signup" ? "Create account and save" : "Sign in and save"}</button>
                <button className="ghost" type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
                  {mode === "signup" ? "I have an account" : "Create an account"}
                </button>
              </div>
              <button className="texty" type="button" onClick={magic} disabled={busy}>Email me a magic link</button>
            </form>
          </>
        ) : (
          <>
            <p>This draft is already stored in the browser. To save it to an account, open Model and add a Supabase URL and publishable key, or bake those into the Pages build. The SQL for the projects table is in <code>supabase/migrations</code>. Add <code>{authCallbackUrl()}</code> to the Supabase redirect allow list.</p>
            <button className="solid" type="button" onClick={onClose}>Keep it on this device</button>
          </>
        )}
      </div>
    </div>
  );
}
