import { buildChecklist } from "@/lib/checklist";
import { rateLimitResponse } from "@/lib/rate-limit";
import { summarizeAnalysis } from "@/lib/summary";
import { lookupZoning } from "@/lib/zoning-lookup";
import type { ProjectProfile } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  const body = (await request.json()) as { profile: ProjectProfile };
  const profile = body.profile;
  const findings = await Promise.race([
    lookupZoning(profile),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 18000)),
  ]);
  const checklist = buildChecklist(profile, findings);
  const summary = summarizeAnalysis(profile, checklist);
  const zoningNote = findings?.codeTitle ? ` Ordinance title seen in search: ${findings.codeTitle}.` : "";
  return NextResponse.json({
    checklist,
    summary: `${summary}${zoningNote}`,
    searched: Boolean(findings?.sources?.length),
  });
}
