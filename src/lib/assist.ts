import { applyAnswer, questionById, type ApplyResult } from "@/lib/interview";
import { ACK_SYSTEM, completeText, llmConfigFromSettings, streamText, stripQuestions } from "@/lib/llm";
import type { ProjectProfile, QuestionId } from "@/lib/types";

export async function interpretAnswer(profile: ProjectProfile, questionId: QuestionId, text: string): Promise<ApplyResult> {
  const local = applyAnswer(profile, questionId, text);
  if (local.ok) return local;
  const config = llmConfigFromSettings();
  const question = questionById(questionId);
  const raw = await completeText(
    config,
    [
      {
        role: "system",
        content:
          "Turn the user's answer into one short plain-language line that a zoning interviewer can parse. Do not add facts. If you cannot tell, repeat their words. Reply with only that line, no JSON, no question.",
      },
      { role: "user", content: `Question: ${question.prompt}\nUser: ${text}\nParser said: ${local.clarification}` },
    ],
    false,
  );
  if (!raw) return local;
  const retried = applyAnswer(local.profile, questionId, raw.replace(/^["']|["']$/g, "").trim());
  return retried.ok ? retried : local;
}

export async function streamAcknowledgement(input: {
  fallback: string;
  userText: string;
  profileSummary: string;
  onDelta: (text: string) => void;
}): Promise<string> {
  const config = llmConfigFromSettings();
  let spoken = "";
  const ok = await streamText(
    config,
    [
      { role: "system", content: ACK_SYSTEM },
      {
        role: "user",
        content: `Project so far:\n${input.profileSummary}\n\nThe user just said: ${input.userText}\n\nA factual acknowledgement, if you need it: ${input.fallback}`,
      },
    ],
    (chunk) => {
      spoken += chunk;
      input.onDelta(stripQuestions(spoken) || spoken);
    },
  );
  const cleaned = ok ? stripQuestions(spoken) : "";
  return cleaned || input.fallback;
}
