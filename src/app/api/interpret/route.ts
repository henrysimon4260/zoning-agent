import { applyAnswer, questionById } from "@/lib/interview";
import { completeText } from "@/lib/llm";
import { rateLimitResponse } from "@/lib/rate-limit";
import type { ProjectProfile, QuestionId } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  const body = (await request.json()) as { profile: ProjectProfile; questionId: QuestionId; text: string };
  const local = applyAnswer(body.profile, body.questionId, body.text);
  if (local.ok) return NextResponse.json(local);

  const question = questionById(body.questionId);
  const raw = await completeText([
    {
      role: "system",
      content:
        "Turn the user's answer into one short plain-language line that a zoning interviewer can parse. Do not add facts. If you cannot tell, repeat their words. Reply with only that line, no JSON, no question.",
    },
    {
      role: "user",
      content: `Question: ${question.prompt}\nUser: ${body.text}\nParser said: ${local.clarification}`,
    },
  ]);
  if (!raw) return NextResponse.json(local);
  const retried = applyAnswer(local.profile, body.questionId, raw.replace(/^["']|["']$/g, "").trim());
  return NextResponse.json(retried.ok ? retried : local);
}
