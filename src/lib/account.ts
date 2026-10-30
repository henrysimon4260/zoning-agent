import { projectTitle } from "@/lib/format";
import { browserSupabase } from "@/lib/supabase/client";
import { mergeProjects } from "@/lib/storage";
import type { ProjectRecord } from "@/lib/types";

export async function currentUserId(): Promise<{ id: string; email: string | null } | null> {
  const supabase = browserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function syncProjects(local: ProjectRecord[]): Promise<{ projects: ProjectRecord[]; error?: string }> {
  const supabase = browserSupabase();
  const user = await currentUserId();
  if (!supabase || !user) return { projects: local };
  const now = new Date().toISOString();
  for (const project of local) {
    const { error } = await supabase.from("projects").upsert({
      id: project.id,
      user_id: user.id,
      title: projectTitle(project.profile),
      data: { ...project, syncedAt: now },
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    });
    if (error) return { projects: local, error: error.message };
  }
  const { data, error } = await supabase.from("projects").select("data").order("updated_at", { ascending: false });
  if (error) return { projects: local, error: error.message };
  const remote = (data ?? []).map((row) => row.data as ProjectRecord);
  const stamped = local.map((project) => ({ ...project, syncedAt: now }));
  return { projects: mergeProjects(stamped, remote) };
}
