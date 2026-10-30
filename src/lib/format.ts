import type { ConstructionType, ProjectProfile, Sprinkler } from "@/lib/types";

export function uid(): string {
  return crypto.randomUUID();
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatSqFt(value: number): string {
  return `${formatNumber(value)} sf`;
}

export function formatFeet(value: number): string {
  return `${formatNumber(value)} ft`;
}

export const CONSTRUCTION_LABELS: Record<ConstructionType, string> = {
  IA: "Type I-A",
  IB: "Type I-B",
  IIA: "Type II-A",
  IIB: "Type II-B",
  IIIA: "Type III-A",
  IIIB: "Type III-B",
  IVA: "Type IV-A",
  IVB: "Type IV-B",
  IVC: "Type IV-C",
  IVHT: "Type IV-HT (heavy timber)",
  VA: "Type V-A",
  VB: "Type V-B",
};

export const SPRINKLER_LABELS: Record<Sprinkler, string> = {
  none: "Not sprinklered",
  nfpa13: "NFPA 13 throughout",
  nfpa13r: "NFPA 13R",
  nfpa13d: "NFPA 13D",
  unknown: "Sprinklers unknown",
};

export function projectTitle(profile: Pick<ProjectProfile, "address" | "name">): string {
  const address = profile.address.trim();
  const name = profile.name.trim();
  return address || name || "Untitled project";
}

export function jurisdictionLabel(profile: Pick<ProjectProfile, "city" | "county" | "state">): string {
  const place = [profile.city.trim(), profile.county.trim()].filter(Boolean).join(", ");
  const state = profile.state.trim();
  return [place, state].filter(Boolean).join(", ");
}

export function profileHash(profile: ProjectProfile): string {
  const { id: _id, ...rest } = profile;
  return JSON.stringify(rest);
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "project";
}

export function reportFilename(title: string): string {
  return `${slugify(title)}-code-analysis.pdf`;
}

export function occupancyPhrase(groups: string[]): string {
  if (groups.length === 0) return "the occupancy";
  if (groups.length === 1) return `Group ${groups[0]}`;
  if (groups.length === 2) return `Groups ${groups[0]} and ${groups[1]}`;
  return `Groups ${groups.slice(0, -1).join(", ")}, and ${groups[groups.length - 1]}`;
}
