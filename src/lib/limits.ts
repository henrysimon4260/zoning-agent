import {
  AREAS,
  HEIGHT_R,
  HEIGHT_STANDARD,
  STORIES,
  cellAt,
  frontageFactor,
  isResidential,
  type Cell,
} from "@/lib/ibc-tables";
import { CONSTRUCTION_LABELS, formatFeet, formatNumber, formatSqFt, occupancyPhrase } from "@/lib/format";
import type { ConstructionType, ProjectProfile, Sprinkler } from "@/lib/types";

export type Compared = "within" | "exceeds" | "review";

export type OccupancyLimit = {
  occupancy: string;
  column: string;
  feet: Cell;
  stories: Cell;
  perStory: Cell;
  total: Cell;
  frontage: number;
  notes: string[];
};

export type HeightAreaAssessment = {
  status: Compared;
  storyStatus: Compared;
  heightStatus: Compared;
  areaStatus: Compared;
  limits: OccupancyLimit[];
  requirements: string[];
  exceptions: string[];
  authoritative: boolean;
};

function formatCell(cell: Cell, unit: "ft" | "stories" | "sf"): string {
  if (cell == null) return "not tabulated";
  if (cell === "UL") return "unlimited";
  if (unit === "ft") return formatFeet(cell);
  if (unit === "sf") return formatSqFt(cell);
  return `${cell} ${cell === 1 ? "story" : "stories"}`;
}

function worse(a: Compared, b: Compared): Compared {
  const rank: Record<Compared, number> = { exceeds: 3, review: 2, within: 1 };
  return rank[a] >= rank[b] ? a : b;
}

function compare(proposed: number | null, allowed: Cell): Compared {
  if (proposed == null || allowed == null) return "review";
  if (allowed === "UL") return "within";
  return proposed <= allowed ? "within" : "exceeds";
}

function columnFor(
  occupancy: string,
  sprinkler: Sprinkler | "",
  kind: "height" | "stories" | "area",
  storyCount: number | null,
): { key: string; notes: string[] } {
  const notes: string[] = [];
  const residential = isResidential(occupancy);
  const system = sprinkler || "unknown";

  if (system === "unknown") {
    notes.push("Sprinkler system isn't chosen, so the nonsprinklered column is shown.");
    return { key: "NS", notes };
  }
  if (system === "none") {
    if (residential) {
      notes.push("New Group R is required to be sprinklered throughout (Section 903.2.8). The NS column is only there to read the unsprinklered baseline.");
    }
    return { key: "NS", notes };
  }
  if (system === "nfpa13d") {
    if (!residential) {
      notes.push("NFPA 13D does not unlock the sprinkler columns for this occupancy. Showing the nonsprinklered values.");
      return { key: "NS", notes };
    }
    notes.push("NFPA 13D is generally limited to certain one- and two-family and townhouse conditions. Confirm Section 903.3.1.3 before relying on it.");
    return { key: kind === "area" ? "NS" : "S13D", notes };
  }
  if (system === "nfpa13r") {
    if (!residential) {
      notes.push("NFPA 13R is a residential system. It does not take the NFPA 13 column. Showing nonsprinklered values until an NFPA 13 system is specified.");
      return { key: "NS", notes };
    }
    if ((storyCount ?? 0) > 4) {
      notes.push("Section 903.3.1.2 limits NFPA 13R to four stories or fewer. Above that, the building needs NFPA 13, and the S column is the one that applies.");
    }
    if (kind === "area") {
      notes.push("Table 506.2 does not publish an NFPA 13R area increase for this group. The nonsprinklered factor is the tabular At, which matches ICC's own 13R example.");
      return { key: "NS", notes };
    }
    return { key: "S13R", notes };
  }
  if (kind === "area") {
    if (storyCount == null) {
      notes.push("Story count isn't set, so the multi-story SM factor is used. A one-story building may take the larger S1 factor.");
      return { key: "SM", notes };
    }
    return { key: storyCount <= 1 ? "S1" : "SM", notes };
  }
  return { key: "S", notes };
}

function heightRow(occupancy: string, key: string): Cell[] | undefined {
  if (isResidential(occupancy)) {
    return HEIGHT_R[key as keyof typeof HEIGHT_R];
  }
  if (key === "NS" || key === "S") return HEIGHT_STANDARD[key];
  return undefined;
}

function add(a: Cell, b: number): Cell {
  if (a == null) return null;
  if (a === "UL") return "UL";
  return a + b;
}

function scale(a: Cell, factor: number): Cell {
  if (a == null) return null;
  if (a === "UL") return "UL";
  return a * factor;
}

export function userAreas(profile: ProjectProfile): {
  perStory: number | null;
  total: number | null;
  note: string | null;
} {
  const area = profile.areaSqFt;
  const stories = profile.stories;
  if (area == null) return { perStory: null, total: null, note: null };
  if (profile.areaBasis === "total") {
    return {
      perStory: stories ? area / stories : null,
      total: area,
      note: stories
        ? `The ${formatSqFt(area)} figure is the whole building, so the per-story check uses ${formatSqFt(area / stories)} as an even split.`
        : "The area was given as a building total. Story count is needed before a per-story check.",
    };
  }
  if (profile.areaBasis === "per-story" || stories === 1) {
    return {
      perStory: area,
      total: stories ? area * stories : null,
      note: profile.areaBasis === "" && stories === 1 ? "With one story, the area is both the story and the building." : null,
    };
  }
  return {
    perStory: area,
    total: stories ? area * stories : null,
    note: "Area basis wasn't stated. It's being checked as a per-story area.",
  };
}

export function evaluateOccupancy(profile: ProjectProfile, occupancy: string): OccupancyLimit | null {
  const type = profile.constructionType;
  if (!type) return null;
  const storyTable = STORIES[occupancy];
  const areaTable = AREAS[occupancy];
  if (!storyTable || !areaTable) return null;

  const storyCol = columnFor(occupancy, profile.sprinkler, "stories", profile.stories);
  const heightCol = columnFor(occupancy, profile.sprinkler, "height", profile.stories);
  const areaCol = columnFor(occupancy, profile.sprinkler, "area", profile.stories);
  const notes = [...new Set([...storyCol.notes, ...heightCol.notes, ...areaCol.notes])];

  const storyRow = storyTable[storyCol.key as keyof typeof storyTable];
  const feetRow = heightRow(occupancy, heightCol.key);
  const ns = cellAt(areaTable.NS, type);
  let at: Cell = null;
  if (areaCol.key === "S1") at = cellAt(areaTable.S1, type);
  else if (areaCol.key === "SM") at = cellAt(areaTable.SM, type);
  else if (areaCol.key === "S13R" && areaTable.S13R) at = cellAt(areaTable.S13R, type);
  else at = ns;

  if (at == null && areaCol.key !== "NS") {
    at = ns;
    notes.push("The selected sprinkler column has no area factor here, so the nonsprinklered factor is used.");
  }

  const factor = frontageFactor(profile.frontagePercent, profile.openSpaceFt);
  if (profile.frontagePercent == null || profile.openSpaceFt == null) {
    notes.push("Frontage increase is 0 until at least 25% of the perimeter has a yard or public way 20 feet or wider (Section 506.3).");
  } else if (factor === 0) {
    notes.push("The frontage described doesn't meet both triggers in Section 506.3, so If = 0.");
  } else {
    notes.push(`Frontage increase If = ${factor.toFixed(2)} from Table 506.3.3.`);
  }

  const nsNumber = typeof ns === "number" ? ns : 0;
  const increase = ns === "UL" ? 0 : nsNumber * factor;
  const perStory = ns === "UL" || at === "UL" ? "UL" : add(at, increase);
  let total: Cell = null;
  const stories = profile.stories;
  if (perStory != null && stories != null) {
    if (stories >= 4) {
      const sa = profile.sprinkler === "nfpa13r" ? 4 : 3;
      total = scale(perStory, sa);
      notes.push(
        stories > 3
          ? `Equation 5-2 multiplies the per-story allowable by Sa = ${sa} once the building is four stories or more. Each story still cannot exceed Equation 5-1.`
          : "",
      );
    } else {
      total = scale(perStory, stories);
      notes.push(`Up to three stories, the building total is the per-story allowable times ${stories}.`);
    }
  }

  const storyCell = Array.isArray(storyRow) ? cellAt(storyRow, type) : null;
  if (storyCell == null && storyCol.key !== "NS") {
    notes.push(
      `Table 504.4 has no ${storyCol.key} story value for ${occupancy} in ${CONSTRUCTION_LABELS[type]}. That column is not available for this combination.`,
    );
  }

  return {
    occupancy,
    column: areaCol.key,
    feet: feetRow ? cellAt(feetRow, type) : null,
    stories: storyCell,
    perStory,
    total,
    frontage: factor,
    notes: notes.filter(Boolean),
  };
}

function governing(values: Cell[]): Cell {
  const numbers = values.filter((value): value is number => typeof value === "number");
  const unlimited = values.filter((value) => value === "UL");
  if (numbers.length === 0) return unlimited.length ? "UL" : null;
  return Math.min(...numbers);
}

export function assessHeightAndArea(profile: ProjectProfile): HeightAreaAssessment {
  const authoritative = profile.codeEdition === "2021" || profile.codeEdition === "unknown";
  const type = profile.constructionType;
  const groups = profile.occupancy.filter((group) => STORIES[group]);
  const missing = profile.occupancy.filter((group) => !STORIES[group]);
  const limits = type ? groups.map((group) => evaluateOccupancy(profile, group)).filter((item): item is OccupancyLimit => Boolean(item)) : [];
  const areas = userAreas(profile);
  const requirements: string[] = [];
  const exceptions: string[] = [
    "Mezzanines that comply with Section 505 are not stories and do not add to building area. They are limited to one-third of the room, or one-half in fully sprinklered Type I or II buildings with emergency voice communication. Clear height above and below is 7 feet.",
    "Basements are left out of the building total when their area doesn't exceed a one-story allowance (Section 506.1.3).",
    "Section 507 can remove the area limit for specific one- and two-story occupancies that are sprinklered and surrounded by wide open yards. It is not a general waiver, and it does not apply to most residential buildings.",
    "Rooftop towers, spires, and similar structures are not used for living or storage. Noncombustible ones are unlimited in height; combustible ones stop 20 feet above the allowable building height (Section 504.3).",
  ];

  if (!type || groups.length === 0) {
    requirements.push(
      "Tables 504.3, 504.4, and 506.2 need an occupancy group and a construction type before a number can be read. Set both in the project panel.",
    );
    return {
      status: "review",
      storyStatus: "review",
      heightStatus: "review",
      areaStatus: "review",
      limits,
      requirements,
      exceptions,
      authoritative,
    };
  }

  const typeLabel = CONSTRUCTION_LABELS[type];
  const editionNote = authoritative
    ? profile.codeEdition === "unknown"
      ? "The edition wasn't specified, so these are unamended 2021 IBC model values."
      : "Figures are the unamended 2021 IBC."
    : `The file is marked ${profile.codeEdition}. The numbers below are 2021 model values, shown only as a reference until that edition's tables are checked.`;

  requirements.push(editionNote);

  for (const limit of limits) {
    requirements.push(
      `${limit.occupancy} in ${typeLabel}: Table 504.3 allows ${formatCell(limit.feet, "ft")} in height, Table 504.4 allows ${formatCell(limit.stories, "stories")}, and Equation 5-1 allows ${formatCell(limit.perStory, "sf")} on a story${limit.total != null ? ` (${formatCell(limit.total, "sf")} for the building)` : ""}.`,
    );
  }

  if (missing.length) {
    requirements.push(
      `${missing.join(", ")} isn't in the desk's 2021 model extract. Read Tables 504.3, 504.4, and 506.2 directly for that group. Several I and H rows are blank unless the building is sprinklered.`,
    );
  }

  if (groups.length > 1) {
    requirements.push(
      `${occupancyPhrase(groups)} are compared here as nonseparated occupancies (Section 508.3), so the most restrictive height and area applies to the whole building.`,
    );
    exceptions.push(
      "Separated occupancies (Section 508.4) let each group use its own allowable area. The sum of actual-area / allowable-area ratios on the story cannot exceed 1, and the groups are divided by the fire barriers in Table 508.4.",
      "An accessory occupancy under 10% of the story (Section 508.2) can be swept into the main occupancy for height and area.",
    );
  }

  const feetAllowed = governing(limits.map((limit) => limit.feet));
  const storiesAllowed = governing(limits.map((limit) => limit.stories));
  const perStoryAllowed = governing(limits.map((limit) => limit.perStory));
  const totalAllowed = governing(limits.map((limit) => limit.total));

  let heightStatus = compare(profile.heightFt, feetAllowed);
  let storyStatus = compare(profile.stories, storiesAllowed);
  let areaStatus: Compared = "review";
  if (areas.perStory == null && areas.total == null) {
    requirements.push("Building area isn't on the file yet, so Equation 5-1 is stated but not compared.");
    areaStatus = "review";
  } else {
    const per = compare(areas.perStory, perStoryAllowed);
    const tot = areas.total == null || totalAllowed == null ? "within" : compare(areas.total, totalAllowed);
    areaStatus = worse(per, tot);
    if (areas.note) requirements.push(areas.note);
    if (areas.perStory != null && perStoryAllowed != null) {
      requirements.push(
        `Proposed story area ${formatSqFt(areas.perStory)} against an allowable ${formatCell(perStoryAllowed, "sf")}.`,
      );
    }
    if (areas.total != null && totalAllowed != null) {
      requirements.push(
        `Proposed building area ${formatSqFt(areas.total)} against a building cap of ${formatCell(totalAllowed, "sf")}.`,
      );
    }
  }

  if (profile.heightFt == null) {
    requirements.push("Height in feet isn't set. Table 504.3 is a separate limit from the story count.");
    heightStatus = "review";
  } else if (feetAllowed != null) {
    requirements.push(`Proposed height ${formatFeet(profile.heightFt)} against ${formatCell(feetAllowed, "ft")} in Table 504.3.`);
  }
  if (profile.stories == null) {
    requirements.push("Story count isn't set.");
    storyStatus = "review";
  } else if (storiesAllowed != null) {
    requirements.push(
      `Proposed ${profile.stories} ${profile.stories === 1 ? "story" : "stories"} against ${formatCell(storiesAllowed, "stories")} in Table 504.4.`,
    );
  }

  const woodOver =
    (type === "VA" || type === "VB" || type === "IIIA" || type === "IIIB") &&
    storyStatus === "exceeds" &&
    profile.occupancy.some(isResidential);
  if (woodOver) {
    exceptions.push(
      "Section 510.2 can treat the building above a 3-hour horizontal separation as a separate building, with height measured from that podium. The upper building still has to fit its own construction type. Sprinklered Group R-2 is tabularly 4 stories in Type V-A and 5 stories in Type III-A, so a five-over-one typically wants Type III-A or better above the podium, not Type V-A.",
    );
  }

  if (!authoritative) {
    return {
      status: "review",
      storyStatus: "review",
      heightStatus: "review",
      areaStatus: "review",
      limits,
      requirements,
      exceptions,
      authoritative,
    };
  }

  const status = worse(worse(heightStatus, storyStatus), areaStatus);
  return { status, storyStatus, heightStatus, areaStatus, limits, requirements, exceptions, authoritative };
}

export function formatAllowable(cell: Cell, unit: "ft" | "stories" | "sf"): string {
  return formatCell(cell, unit);
}

export function describeFrontage(profile: ProjectProfile): string {
  const factor = frontageFactor(profile.frontagePercent, profile.openSpaceFt);
  if (profile.frontagePercent == null || profile.openSpaceFt == null) {
    return "Frontage not described. If is taken as 0.";
  }
  return `${formatNumber(profile.frontagePercent)}% of the perimeter, narrowest open dimension ${formatFeet(profile.openSpaceFt)}, If = ${factor.toFixed(2)}.`;
}
