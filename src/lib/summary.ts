import { jurisdictionLabel, occupancyPhrase, projectTitle } from "@/lib/format";
import type { ChecklistItem, ProjectProfile } from "@/lib/types";

export function summarizeAnalysis(profile: ProjectProfile, items: ChecklistItem[]): string {
  const title = projectTitle(profile);
  const place = jurisdictionLabel(profile);
  const exceeds = items.filter((item) => item.applies && item.status === "exceeds");
  const verified = items.filter((item) => item.citation === "verified").length;
  const zoning = items.filter((item) => item.domain === "zoning");
  const unverified = zoning.filter((item) => item.citation === "unverified").length;
  const lead = exceeds.length
    ? exceeds.map((item) => `${item.title} (${item.section}) is over the limit on this file.`).join(" ")
    : "Nothing on the file is over a tabular limit yet. Several items still need a measurement or a confirmed ordinance section.";
  const where = place ? ` for ${place}` : "";
  const use = profile.occupancy.length ? ` ${occupancyPhrase(profile.occupancy)}.` : "";
  return [
    `Drafted ${items.length} sections for ${title}${where}.${use}`,
    lead,
    verified
      ? `${verified} zoning ${verified === 1 ? "item was" : "items were"} read from a linked ordinance page. ${unverified} remain unverified.`
      : `Zoning is unverified${place ? ` for ${place}` : ""}. I left search links on each zoning item. A number there is not a finding until it is read from the adopted code.`,
    "Uncheck anything that does not apply, and write notes in the margin. I can write the PDF whenever you want it.",
  ].join(" ");
}
