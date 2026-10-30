import {
  CONSTRUCTION_LABELS,
  SPRINKLER_LABELS,
  formatFeet,
  formatNumber,
  formatSqFt,
  jurisdictionLabel,
  projectTitle,
  reportFilename,
} from "@/lib/format";
import type { ChecklistItem, ProjectProfile } from "@/lib/types";
import { DISCLAIMER } from "@/lib/types";

export type ReportRow = { label: string; value: string };

export type ReportSection = {
  domain: "building" | "zoning";
  section: string;
  title: string;
  status: string;
  applies: boolean;
  summary: string;
  requirements: string[];
  exceptions: string[];
  notes: string;
  citation: string;
  sources: { label: string; url: string }[];
};

export type ReportModel = {
  title: string;
  filename: string;
  kicker: string;
  disclaimer: string;
  rows: ReportRow[];
  sections: ReportSection[];
  generatedAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  within: "Within the tabular limit",
  exceeds: "Over the tabular limit",
  review: "Needs a closer look",
  info: "Background",
};

const CITATION_LABEL: Record<string, string> = {
  "model-code": "2021 IBC model code — confirm the adopted edition",
  verified: "Read from the linked ordinance",
  unverified: "Unverified — not read from the adopted code",
};

function dash(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  return text || "—";
}

export function buildReport(profile: ProjectProfile, items: ChecklistItem[], generatedAt = new Date().toISOString()): ReportModel {
  const title = projectTitle(profile);
  const scope =
    profile.scope === "new"
      ? "New building"
      : profile.scope === "addition"
        ? "Addition"
        : profile.scope === "alteration"
          ? "Alteration"
          : profile.scope === "change-of-occupancy"
            ? "Change of occupancy"
            : "—";
  const frontage =
    profile.frontagePercent != null && profile.openSpaceFt != null
      ? `${formatNumber(profile.frontagePercent)}% open, narrowest ${formatFeet(profile.openSpaceFt)}`
      : "—";
  const area =
    profile.areaSqFt != null
      ? `${formatSqFt(profile.areaSqFt)}${profile.areaBasis === "total" ? " total" : profile.areaBasis === "per-story" ? " per story" : ""}`
      : "—";

  return {
    title,
    filename: reportFilename(title),
    kicker: "Lintel code analysis",
    disclaimer: DISCLAIMER,
    generatedAt,
    rows: [
      { label: "Project", value: dash(profile.name) },
      { label: "Address", value: dash(profile.address) },
      { label: "Jurisdiction", value: dash(jurisdictionLabel(profile)) },
      { label: "Occupancy", value: profile.occupancy.length ? profile.occupancy.join(", ") : "—" },
      { label: "Construction", value: profile.constructionType ? CONSTRUCTION_LABELS[profile.constructionType] : "—" },
      { label: "Zoning district", value: dash(profile.zoningDistrict) },
      { label: "Overlays", value: profile.overlays.length ? profile.overlays.join(", ") : "None recorded" },
      { label: "Stories", value: profile.stories != null ? String(profile.stories) : "—" },
      { label: "Height", value: profile.heightFt != null ? formatFeet(profile.heightFt) : "—" },
      { label: "Area", value: area },
      { label: "Sprinklers", value: profile.sprinkler ? SPRINKLER_LABELS[profile.sprinkler] : "—" },
      { label: "Lot", value: profile.lotSqFt != null ? formatSqFt(profile.lotSqFt) : "—" },
      { label: "Frontage", value: frontage },
      { label: "Scope", value: scope },
      { label: "Code basis", value: profile.codeEdition === "unknown" ? "Edition not specified" : `${profile.codeEdition} adopted edition on file` },
      { label: "Notes", value: dash(profile.notes) },
    ],
    sections: items.map((item) => ({
      domain: item.domain,
      section: item.section,
      title: item.title,
      status: STATUS_LABEL[item.status] ?? item.status,
      applies: item.applies,
      summary: item.summary,
      requirements: item.requirements,
      exceptions: item.exceptions,
      notes: item.notes.trim(),
      citation: CITATION_LABEL[item.citation] ?? item.citation,
      sources: item.sources,
    })),
  };
}
