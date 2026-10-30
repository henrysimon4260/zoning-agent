import { uid } from "@/lib/format";
import { QUESTIONS } from "@/lib/interview";
import type { ChatMessage, ProjectProfile, ProjectRecord, QuestionId } from "@/lib/types";

const KEY = "lintel.projects.v1";
const ACTIVE = "lintel.active.v1";

export function emptyProfile(id = uid()): ProjectProfile {
  return {
    id,
    name: "",
    address: "",
    city: "",
    county: "",
    state: "",
    occupancy: [],
    constructionType: "",
    zoningDistrict: "",
    overlays: [],
    stories: null,
    heightFt: null,
    areaSqFt: null,
    areaBasis: "",
    sprinkler: "",
    lotSqFt: null,
    lotWidthFt: null,
    frontagePercent: null,
    openSpaceFt: null,
    scope: "",
    codeEdition: "2021",
    notes: "",
  };
}

export function createProject(): ProjectRecord {
  const profile = emptyProfile();
  const now = new Date().toISOString();
  const first: ChatMessage = { id: uid(), role: "assistant", content: QUESTIONS[0].prompt };
  return {
    id: profile.id,
    createdAt: now,
    updatedAt: now,
    profile,
    checklist: [],
    messages: [first],
    skipped: [],
    analyzedHash: "",
  };
}

export function mergeProjects(local: ProjectRecord[], remote: ProjectRecord[]): ProjectRecord[] {
  const map = new Map<string, ProjectRecord>();
  for (const project of local) map.set(project.id, project);
  for (const project of remote) {
    const existing = map.get(project.id);
    if (!existing || project.updatedAt > existing.updatedAt) map.set(project.id, project);
  }
  return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadProjects(): ProjectRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: ProjectRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(projects));
}

export function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE);
}

export function saveActiveId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE, id);
}

export function upsertProject(projects: ProjectRecord[], project: ProjectRecord): ProjectRecord[] {
  const next = projects.some((item) => item.id === project.id)
    ? projects.map((item) => (item.id === project.id ? project : item))
    : [project, ...projects];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function isQuestionId(value: string): value is QuestionId {
  return QUESTIONS.some((question) => question.id === value);
}
