"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { currentUserId, syncProjects } from "@/lib/account";
import { jurisdictionLabel, projectTitle } from "@/lib/format";
import { browserSupabase } from "@/lib/supabase/client";
import { loadActiveId, loadProjects, saveActiveId, saveProjects } from "@/lib/storage";
import type { ProjectRecord } from "@/lib/types";

export default function ProjectsPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const active = typeof window === "undefined" ? null : loadActiveId();

  useEffect(() => {
    const local = loadProjects();
    setProjects(local);
    setReady(true);
    currentUserId().then(async (user) => {
      setEmail(user?.email ?? null);
      if (!user) return;
      const synced = await syncProjects(local);
      if (!synced.error) {
        saveProjects(synced.projects);
        setProjects(synced.projects);
      }
    });
  }, []);

  function remove(id: string) {
    const next = loadProjects().filter((project) => project.id !== id);
    saveProjects(next);
    setProjects(next);
    const supabase = browserSupabase();
    if (supabase && email) void supabase.from("projects").delete().eq("id", id);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="mark">Ln</span>
          <span>
            <span className="brand-name">Lintel</span>
            <span className="brand-kicker">Projects</span>
          </span>
        </Link>
        <div className="top-actions">
          <button className="ghost" type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            {resolvedTheme === "dark" ? "Light" : "Dark"}
          </button>
          {email ? (
            <button
              className="ghost"
              type="button"
              onClick={async () => {
                await browserSupabase()?.auth.signOut();
                setEmail(null);
              }}
            >
              Sign out
            </button>
          ) : null}
          <Link className="solid" href="/">Back to the desk</Link>
        </div>
      </header>
      {!ready ? <p style={{ padding: 24 }}>Opening the drawer…</p> : null}
      {ready && projects.length === 0 ? (
        <div className="empty-library">
          <p className="kicker">Nothing filed</p>
          <h1>No projects yet.</h1>
          <p className="lede">Start an interview on the desk. It stays in this browser until you choose Save.</p>
        </div>
      ) : (
        <div className="project-list">
          <p className="kicker" style={{ marginBottom: 0 }}>{email ? `Signed in as ${email}` : "On this device"}</p>
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div>
                <h2>{projectTitle(project.profile)}</h2>
                <p>
                  {[jurisdictionLabel(project.profile), project.profile.occupancy.join(", "), project.checklist.length ? `${project.checklist.length} sections` : "Interview in progress"]
                    .filter(Boolean)
                    .join(" · ")}
                  {project.id === active ? " · Open" : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Link className="solid" href="/" onClick={() => saveActiveId(project.id)}>Open</Link>
                <button className="ghost" type="button" onClick={() => remove(project.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
