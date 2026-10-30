import { buildChecklist } from "@/lib/checklist";
import { profileHash, uid } from "@/lib/format";
import { applyAnswer, nextQuestion, QUESTIONS, type ApplyResult } from "@/lib/interview";
import { summarizeAnalysis } from "@/lib/summary";
import { emptyProfile } from "@/lib/storage";
import type { ChatMessage, ProjectProfile, ProjectRecord, QuestionId } from "@/lib/types";

export const PINE_STREET_ANSWERS: Record<QuestionId, string> = {
  identity: "412 East Pine Street",
  jurisdiction: "Seattle, WA",
  occupancy: "R-2 apartments over M retail",
  construction: "Type VA",
  zoning: "NC3-75",
  overlays: "none",
  height: "6 stories, 68 feet",
  area: "12000 sf per story",
  sprinkler: "NFPA 13",
  lot: "15000 sf, 120 feet wide",
  frontage: "50 percent of the perimeter, 40 feet open",
  scope: "New building",
  notes: "Podium at grade is under discussion.",
};

export function replayInterview(answers: Partial<Record<QuestionId, string>>): {
  profile: ProjectProfile;
  skipped: QuestionId[];
  messages: ChatMessage[];
  pending: ApplyResult | null;
} {
  let profile = emptyProfile();
  const skipped: QuestionId[] = [];
  const messages: ChatMessage[] = [];
  let pending: ApplyResult | null = null;
  for (let guard = 0; guard < QUESTIONS.length + 2; guard += 1) {
    const question = nextQuestion(profile, skipped);
    if (!question) break;
    const answer = answers[question.id];
    if (!answer) break;
    messages.push({ id: uid(), role: "assistant", content: question.prompt });
    messages.push({ id: uid(), role: "user", content: answer });
    const result = applyAnswer(profile, question.id, answer);
    pending = result;
    if (!result.ok) break;
    profile = result.profile;
    if (result.skip) skipped.push(question.id);
  }
  return { profile, skipped, messages, pending };
}

export function pineStreetProject(): ProjectRecord {
  const played = replayInterview(PINE_STREET_ANSWERS);
  if (played.pending && !played.pending.ok) {
    throw new Error(played.pending.clarification);
  }
  const checklist = buildChecklist(played.profile, null);
  const now = new Date().toISOString();
  return {
    id: played.profile.id,
    createdAt: now,
    updatedAt: now,
    profile: played.profile,
    checklist,
    skipped: played.skipped,
    analyzedHash: profileHash(played.profile),
    messages: [
      ...played.messages,
      { id: uid(), role: "assistant", content: summarizeAnalysis(played.profile, checklist) },
    ],
  };
}
