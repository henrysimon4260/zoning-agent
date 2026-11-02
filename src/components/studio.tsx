"use client";

import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SaveDialog } from "@/components/save-dialog";
import { ReportView } from "@/components/report-view";
import { Sheet } from "@/components/sheet";
import { syncProjects } from "@/lib/account";
import { preserveChecklistEdits } from "@/lib/checklist";
import { profileHash, projectTitle, reportFilename, uid } from "@/lib/format";
import { applyAnswer, canDraft, interviewProgress, nextQuestion } from "@/lib/interview";
import { applyParcel, PARCEL_SKIPS, type ResolveResult } from "@/lib/nyc";
import { browserSupabase } from "@/lib/supabase/client";
import { supabasePublicConfig } from "@/lib/supabase/env";
import {
  createProject,
  loadActiveId,
  loadProjects,
  saveActiveId,
  saveProjects,
  upsertProject,
} from "@/lib/storage";
import type { ChatMessage, ProjectProfile, ProjectRecord, QuestionId } from "@/lib/types";

export function Studio() {
  const { resolvedTheme, setTheme } = useTheme();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"profile" | "checklist">("profile");
  const [panel, setPanel] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [llmOn, setLlmOn] = useState(false);
  const [authOn, setAuthOn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; borough: string }[]>([]);
  const [toast, setToast] = useState("");
  const [phase, setPhase] = useState<"" | "lot" | "checklist">("");
  const threadRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<ProjectRecord | null>(null);

  useEffect(() => {
    const all = loadProjects();
    const active = loadActiveId();
    const found = all.find((item) => item.id === active) ?? all[0] ?? createProject();
    if (!all.some((item) => item.id === found.id)) {
      saveProjects(upsertProject(all, found));
      saveActiveId(found.id);
    }
    projectRef.current = found;
    setProject(found);
    setReady(true);
    fetch("/api/health")
      .then((response) => response.json())
      .then((data: { llm?: boolean }) => setLlmOn(Boolean(data.llm)))
      .catch(() => undefined);
    setAuthOn(Boolean(supabasePublicConfig()));
    const supabase = browserSupabase();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [project?.messages.length, busy, phase]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSaveOpen(false);
      setReportOpen(false);
      setPanel(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const question = useMemo(() => (project ? nextQuestion(project.profile, project.skipped) : null), [project]);

  useEffect(() => {
    if (question?.id !== "identity" || draft.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      fetch(`/api/nyc/suggest?text=${encodeURIComponent(draft.trim())}`)
        .then((response) => response.json())
        .then((data: { suggestions?: { label: string; borough: string }[] }) => setAddressSuggestions(data.suggestions ?? []))
        .catch(() => setAddressSuggestions([]));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [draft, question?.id]);
  const fresh = project ? !project.messages.some((message) => message.role === "user") : true;
  const stale = Boolean(project && project.checklist.length && project.analyzedHash && project.analyzedHash !== profileHash(project.profile));

  function commit(next: ProjectRecord) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    projectRef.current = stamped;
    setProject(stamped);
    saveProjects(upsertProject(loadProjects(), stamped));
    saveActiveId(stamped.id);
  }

  function patch(updater: (current: ProjectRecord) => ProjectRecord) {
    const current = projectRef.current;
    if (!current) return;
    commit(updater(current));
  }

  async function streamReply(fallback: string, nextPrompt: string | null, summary: string, userText: string) {
    const id = uid();
    patch((current) => ({
      ...current,
      messages: [...current.messages, { id, role: "assistant", content: "" }],
    }));
    let content = fallback + (nextPrompt ? `\n\n${nextPrompt}` : "");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallback, nextPrompt, userText, profileSummary: summary }),
      });
      if (response.status === 429) throw new Error("Too many requests. Wait a minute and try again.");
      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        content = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          content += decoder.decode(value);
          const snapshot = content;
          const current = projectRef.current;
          if (!current) return;
          const next = {
            ...current,
            messages: current.messages.map((message) => (message.id === id ? { ...message, content: snapshot } : message)),
          };
          projectRef.current = next;
          setProject(next);
        }
      }
    } catch (error) {
      content = fallback + (nextPrompt ? `\n\n${nextPrompt}` : "");
      if (error instanceof Error && error.message.startsWith("Too many")) throw error;
    }
    const current = projectRef.current;
    if (!current) return;
    commit({
      ...current,
      messages: current.messages.map((message) => (message.id === id ? { ...message, content: content || fallback } : message)),
    });
  }

  async function runAnalysis(base: ProjectRecord, leadIn: ChatMessage[]) {
    setPhase("checklist");
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: base.profile }),
    });
    if (response.status === 429) throw new Error("Too many requests. Wait a minute and try again.");
    if (!response.ok) throw new Error("The analysis didn't come back.");
    const body = (await response.json()) as { checklist: ProjectRecord["checklist"]; summary: string };
    const checklist = preserveChecklistEdits(base.checklist, body.checklist);
    commit({
      ...base,
      messages: [...leadIn, { id: uid(), role: "assistant", content: body.summary }],
      checklist,
      analyzedHash: profileHash(base.profile),
    });
    setTab("checklist");
    setPanel(true);
    setPhase("");
  }

  async function send(text: string) {
    const trimmed = text.trim();
    const current = projectRef.current;
    if (!trimmed || !current || busy) return;
    setBusy(true);
    setDraft("");
    const userMessage: ChatMessage = { id: uid(), role: "user", content: trimmed };
    try {
      if (/^(draft the checklist|draft|analyze|update the checklist)$/i.test(trimmed)) {
        if (!canDraft(current.profile)) {
          commit({
            ...current,
            messages: [...current.messages, userMessage, { id: uid(), role: "assistant", content: "I need an occupancy, a construction type, or a zoning district before a checklist is worth drafting." }],
          });
          return;
        }
        await runAnalysis(current, [...current.messages, userMessage]);
        return;
      }
      if (/^(write the report|generate the report|pdf|report)$/i.test(trimmed)) {
        await attachReport([...current.messages, userMessage]);
        return;
      }
      if (/^(continue|continue the interview|next question)$/i.test(trimmed)) {
        const upcoming = nextQuestion(current.profile, current.skipped);
        commit({
          ...current,
          messages: [...current.messages, userMessage, { id: uid(), role: "assistant", content: upcoming?.prompt ?? "That's the end of the interview. Draft the checklist whenever you want." }],
        });
        return;
      }

      const asked = nextQuestion(current.profile, current.skipped);
      if (asked?.id === "identity" && !/^(skip|not sure|unknown|n\/a)$/i.test(trimmed)) {
        const askedRecord: ProjectRecord = { ...current, messages: [...current.messages, userMessage] };
        projectRef.current = askedRecord;
        setProject(askedRecord);
        setAddressSuggestions([]);
        setPhase("lot");
        const response = await fetch("/api/nyc/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
        if (response.status === 429) throw new Error("Too many requests. Wait a minute and try again.");
        if (!response.ok) throw new Error("City data didn't answer. Try the address again in a moment.");
        const resolved = (await response.json()) as ResolveResult;
        setPhase("");
        if (resolved.status !== "ok") {
          commit({
            ...askedRecord,
            messages: [...askedRecord.messages, { id: uid(), role: "assistant", content: resolved.prompt }],
          });
          return;
        }
        const profile = applyParcel(askedRecord.profile, resolved.parcel);
        const skipped = [...new Set([...askedRecord.skipped, ...PARCEL_SKIPS])];
        const withParcel: ProjectRecord = { ...askedRecord, profile, skipped };
        projectRef.current = withParcel;
        setProject(withParcel);
        setPanel(true);
        const upcoming = nextQuestion(profile, skipped);
        await streamReply(resolved.acknowledgement, upcoming?.prompt ?? null, JSON.stringify(profile), trimmed);
        const after = projectRef.current;
        if (after && !upcoming && canDraft(after.profile)) await runAnalysis(after, after.messages);
        return;
      }
      if (!asked) {
        commit({
          ...current,
          profile: { ...current.profile, notes: current.profile.notes ? `${current.profile.notes}\n${trimmed}` : trimmed },
          messages: [...current.messages, userMessage, { id: uid(), role: "assistant", content: "Added to the notes. Say “draft” if you want the checklist refreshed." }],
        });
        return;
      }

      let result = applyAnswer(current.profile, asked.id, trimmed);
      if (!result.ok) {
        try {
          const response = await fetch("/api/interpret", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: current.profile, questionId: asked.id, text: trimmed }),
          });
          if (response.status === 429) throw new Error("Too many requests. Wait a minute and try again.");
          if (response.ok) result = await response.json();
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Too many")) throw error;
        }
      }
      const skipped = result.ok && result.skip ? [...current.skipped, asked.id] : current.skipped;
      const withUser: ProjectRecord = { ...current, profile: result.profile, skipped, messages: [...current.messages, userMessage] };
      if (!result.ok) {
        commit({ ...withUser, messages: [...withUser.messages, { id: uid(), role: "assistant", content: result.clarification }] });
        return;
      }
      const upcoming = nextQuestion(result.profile, skipped);
      projectRef.current = withUser;
      setProject(withUser);
      const summary = JSON.stringify({ ...result.profile, id: undefined });
      await streamReply(result.acknowledgement, upcoming?.prompt ?? null, summary, trimmed);
      const after = projectRef.current;
      if (after && !upcoming && canDraft(after.profile)) {
        await runAnalysis(after, after.messages);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      patch((record) => ({
        ...record,
        messages: [...record.messages, { id: uid(), role: "assistant", content: message }],
      }));
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  async function attachReport(messages: ChatMessage[]) {
    const current = projectRef.current;
    if (!current || current.checklist.length === 0) {
      commit({
        ...(current as ProjectRecord),
        messages: [...messages, { id: uid(), role: "assistant", content: "Draft the checklist first. The report is that list, with your checks and notes." }],
      });
      return;
    }
    const title = projectTitle(current.profile);
    commit({
      ...current,
      messages: [
        ...messages,
        {
          id: uid(),
          role: "assistant",
          content: `The report for ${title} is ready. It includes the profile, every section, what you marked as applying, your notes, and the disclaimer.`,
          attachment: { kind: "report", title, filename: reportFilename(title) },
        },
      ],
    });
    setReportOpen(true);
  }

  async function download() {
    const current = projectRef.current;
    if (!current) return;
    setDownloading(true);
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: current.profile, checklist: current.checklist }),
      });
      if (response.status === 429) {
        setToast("Too many requests. Wait a minute and try the PDF again.");
        return;
      }
      if (!response.ok) throw new Error("PDF failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reportFilename(projectTitle(current.profile));
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      setToast("The PDF didn't generate. Try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  function editProfile(patchProfile: Partial<ProjectProfile>) {
    patch((current) => {
      const silenced: QuestionId[] = [...current.skipped];
      const silence = (id: QuestionId) => {
        if (!silenced.includes(id)) silenced.push(id);
      };
      if ("name" in patchProfile || "address" in patchProfile) silence("identity");
      if ("city" in patchProfile || "state" in patchProfile || "county" in patchProfile) silence("jurisdiction");
      if ("occupancy" in patchProfile) silence("occupancy");
      if ("constructionType" in patchProfile) silence("construction");
      if ("zoningDistrict" in patchProfile) silence("zoning");
      if ("overlays" in patchProfile) silence("overlays");
      if ("stories" in patchProfile || "heightFt" in patchProfile) silence("height");
      if ("areaSqFt" in patchProfile || "areaBasis" in patchProfile) silence("area");
      if ("sprinkler" in patchProfile) silence("sprinkler");
      if ("lotSqFt" in patchProfile || "lotWidthFt" in patchProfile) silence("lot");
      if ("frontagePercent" in patchProfile || "openSpaceFt" in patchProfile) silence("frontage");
      if ("scope" in patchProfile) silence("scope");
      if ("notes" in patchProfile) silence("notes");
      return { ...current, skipped: silenced, profile: { ...current.profile, ...patchProfile } };
    });
  }

  async function saveToAccount() {
    const current = projectRef.current;
    if (!current) return;
    const local = upsertProject(loadProjects(), current);
    const synced = await syncProjects(local);
    if (synced.error) {
      setToast(`Saved on this device. The account didn't take it: ${synced.error}`);
      setSaveOpen(false);
      return;
    }
    saveProjects(synced.projects);
    const refreshed = synced.projects.find((item) => item.id === current.id) ?? current;
    projectRef.current = refreshed;
    setProject(refreshed);
    setToast("Saved to your account.");
    setSaveOpen(false);
  }

  function startNew() {
    const created = createProject();
    commit(created);
    setTab("profile");
    setDraft("");
  }

  if (!ready || !project) {
    return (
      <main className="app-shell">
        <p className="kicker" style={{ padding: 28 }}>Opening the desk…</p>
      </main>
    );
  }

  const suggestions = question?.suggestions ?? [];
  const progress = interviewProgress(project.profile, project.skipped);
  const showDraft = canDraft(project.profile) && (project.checklist.length === 0 || stale);
  const showContinue = Boolean(question && project.checklist.length > 0);
  const showReport = project.checklist.length > 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Lintel home">
          <span className="mark">Ln</span>
          <span>
            <span className="brand-name">Lintel</span>
            <span className="brand-kicker">Code desk</span>
          </span>
        </Link>
        <div className="top-actions">
          <button className="ghost mobile-toggle" type="button" onClick={() => setPanel(true)}>Sheet</button>
          <Link className="ghost" href="/projects">Projects</Link>
          <button className="ghost" type="button" onClick={startNew}>New</button>
          <button className="ghost" type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle color theme">
            {resolvedTheme === "dark" ? "Light" : "Dark"}
          </button>
          <button className="solid" type="button" onClick={() => (email ? void saveToAccount() : setSaveOpen(true))}>
            Save
          </button>
        </div>
      </header>
      <div className="workspace">
        <section className="chat-column" aria-label="Interview">
          <div className="thread" ref={threadRef} aria-live="polite">
            {fresh ? (
              <div className="hero">
                <h1>NYC zoning, instantly.</h1>
                <p className="lede">Enter an address. Get the zoning, code sections, and a project-ready report.</p>
                <div className="suggestions">
                  <button className="chip" type="button" onClick={() => void send("1 Centre Street, Manhattan")}>1 Centre Street, Manhattan</button>
                  <button className="chip" type="button" onClick={() => void send("20 Willow Street, Brooklyn")}>20 Willow Street, Brooklyn</button>
                </div>
              </div>
            ) : (
              project.messages.map((message) => (
                <div className={`bubble-row ${message.role}`} key={message.id}>
                  <div className={`bubble ${message.role}`}>
                    {message.content || (busy ? "…" : "")}
                    {message.attachment ? (
                      <div className="attachment">
                        <div className="attachment-thumb" aria-hidden />
                        <div>
                          <strong>{message.attachment.title}</strong>
                          <span>{message.attachment.filename}</span>
                          <div className="attachment-actions">
                            <button className="solid" type="button" onClick={() => setReportOpen(true)}>Open</button>
                            <button className="ghost" type="button" onClick={download}>Download</button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {busy && phase === "lot" ? (
              <div className="bubble-row assistant">
                <div className="bubble assistant reading">Reading the tax lot…</div>
              </div>
            ) : null}
            {busy && phase === "checklist" ? (
              <div className="bubble-row assistant">
                <div className="bubble assistant reading">Drafting the checklist…</div>
              </div>
            ) : null}
          </div>
          <div className="composer-wrap">
            {fresh ? null : (
              <div className="progress" aria-label="Interview progress">
                <span>{progress.done ? "Ready to draft" : `${progress.label} · ${progress.step} of ${progress.total}`}</span>
                <div className="meter" aria-hidden><i style={{ width: `${progress.total ? (progress.step / progress.total) * 100 : 0}%` }} /></div>
              </div>
            )}
            {question?.id === "identity" && addressSuggestions.length > 0 ? (
              <div className="suggest-list" role="listbox" aria-label="NYC address matches">
                {addressSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.label}-${suggestion.borough}`}
                    type="button"
                    onClick={() => {
                      const named = suggestion.borough && !suggestion.label.toLowerCase().includes(suggestion.borough.toLowerCase())
                        ? `${suggestion.label}, ${suggestion.borough}`
                        : suggestion.label;
                      void send(named);
                    }}
                    disabled={busy}
                  >
                    {suggestion.label}
                    <span style={{ color: "var(--muted)" }}> · {suggestion.borough}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="suggestions">
              {fresh ? null : suggestions.map((suggestion) => (
                <button key={suggestion} className="chip" type="button" onClick={() => send(suggestion)} disabled={busy}>{suggestion}</button>
              ))}
              {showDraft ? <button className="chip" type="button" onClick={() => send("Draft the checklist")} disabled={busy}>Draft the checklist</button> : null}
              {showContinue ? <button className="chip" type="button" onClick={() => send("Continue")} disabled={busy}>Continue</button> : null}
              {showReport ? <button className="chip" type="button" onClick={() => send("Write the report")} disabled={busy}>Write the report</button> : null}
            </div>
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
            >
              <label className="sr-only" htmlFor="answer" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Your answer</label>
              <textarea
                id="answer"
                rows={1}
                placeholder={fresh ? "New York City address" : question ? "Answer, or type skip" : "Ask for the checklist or the report"}
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
              />
              <button className="solid" type="submit" disabled={busy || !draft.trim()}>{phase === "lot" ? "Reading…" : busy ? "…" : "Send"}</button>
            </form>
            <div className="status-line">
              <span>{llmOn ? "Ordinance search is on." : "The interview runs on this desk. Ordinance search starts when the server has an xAI key."}</span>
              <span>{email ?? "Not saved to an account"}</span>
            </div>
            {toast ? <p className="status-line">{toast}</p> : null}
          </div>
        </section>
        <Sheet
          open={panel}
          profile={project.profile}
          checklist={project.checklist}
          tab={tab}
          stale={Boolean(stale)}
          onTab={setTab}
          onClose={() => setPanel(false)}
          onProfile={editProfile}
          onToggle={(id, applies) => patch((current) => ({
            ...current,
            checklist: current.checklist.map((item) => (item.id === id ? { ...item, applies } : item)),
          }))}
          onNote={(id, notes) => patch((current) => ({
            ...current,
            checklist: current.checklist.map((item) => (item.id === id ? { ...item, notes } : item)),
          }))}
          onRedraft={() => void send("Draft the checklist")}
        />
      </div>
      {saveOpen ? (
        <SaveDialog
          configured={authOn}
          onClose={() => setSaveOpen(false)}
          onSignedIn={saveToAccount}
        />
      ) : null}
      {reportOpen ? (
        <ReportView
          profile={project.profile}
          checklist={project.checklist}
          downloading={downloading}
          onClose={() => setReportOpen(false)}
          onDownload={() => void download()}
        />
      ) : null}
    </div>
  );
}
