import { projectTitle, reportFilename } from "@/lib/format";
import { renderReportPdf } from "@/lib/pdf";
import { rateLimitResponse } from "@/lib/rate-limit";
import type { ChecklistItem, ProjectProfile } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  const body = (await request.json()) as { profile: ProjectProfile; checklist: ChecklistItem[] };
  const bytes = await renderReportPdf(body.profile, body.checklist ?? []);
  const filename = reportFilename(projectTitle(body.profile));
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
