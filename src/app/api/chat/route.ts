import { ACK_SYSTEM, streamText, stripQuestions } from "@/lib/llm";
import { rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Body = {
  fallback: string;
  nextPrompt?: string | null;
  userText: string;
  profileSummary: string;
};

export async function POST(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  const body = (await request.json()) as Body;
  const fallback = (body.fallback || "").trim();
  const nextPrompt = body.nextPrompt?.trim() || "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let spoken = "";
      const ok = await streamText(
        [
          { role: "system", content: ACK_SYSTEM },
          {
            role: "user",
            content: `Project so far:\n${body.profileSummary}\n\nThe user just said: ${body.userText}\n\nA factual acknowledgement, if you need it: ${fallback}`,
          },
        ],
        (chunk) => {
          spoken += chunk;
        },
      );
      const cleaned = ok ? stripQuestions(spoken) : "";
      const acknowledgement = cleaned || fallback;
      const pieces = acknowledgement.match(/\s*\S+\s*/g) ?? [acknowledgement];
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      if (nextPrompt) controller.enqueue(encoder.encode(`\n\n${nextPrompt}`));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
