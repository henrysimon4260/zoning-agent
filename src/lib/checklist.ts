import { CONSTRUCTION_LABELS, formatNumber, formatSqFt, jurisdictionLabel, occupancyPhrase } from "@/lib/format";
import { formatAllowable } from "@/lib/limits";
import { assessHeightAndArea, userAreas } from "@/lib/limits";
import { modelCodeSource, zoningSearchLinks } from "@/lib/sources";
import type { ChecklistItem, Citation, ProjectProfile, ZoningFindings, ZoningTopic } from "@/lib/types";

type Draft = Omit<ChecklistItem, "applies" | "notes"> & { applies?: boolean; notes?: string };

function item(draft: Draft): ChecklistItem {
  return {
    applies: true,
    notes: "",
    ...draft,
  };
}

const MODEL: Citation = "model-code";

const RATINGS: Record<string, { frame: string; bearingExt: string; bearingInt: string; floor: string; roof: string } | "mass-timber"> = {
  IA: { frame: "3 hours", bearingExt: "3 hours", bearingInt: "3 hours", floor: "2 hours", roof: "1.5 hours" },
  IB: { frame: "2 hours", bearingExt: "2 hours", bearingInt: "2 hours", floor: "2 hours", roof: "1 hour" },
  IIA: { frame: "1 hour", bearingExt: "1 hour", bearingInt: "1 hour", floor: "1 hour", roof: "1 hour" },
  IIB: { frame: "0 (unrated)", bearingExt: "0 (unrated)", bearingInt: "0 (unrated)", floor: "0 (unrated)", roof: "0 (unrated)" },
  IIIA: { frame: "1 hour", bearingExt: "2 hours", bearingInt: "1 hour", floor: "1 hour", roof: "1 hour" },
  IIIB: { frame: "0 (unrated)", bearingExt: "2 hours", bearingInt: "0 (unrated)", floor: "0 (unrated)", roof: "0 (unrated)" },
  IVA: "mass-timber",
  IVB: "mass-timber",
  IVC: "mass-timber",
  IVHT: { frame: "heavy timber", bearingExt: "2 hours", bearingInt: "1 hour or heavy timber", floor: "heavy timber", roof: "heavy timber" },
  VA: { frame: "1 hour", bearingExt: "1 hour", bearingInt: "1 hour", floor: "1 hour", roof: "1 hour" },
  VB: { frame: "0 (unrated)", bearingExt: "0 (unrated)", bearingInt: "0 (unrated)", floor: "0 (unrated)", roof: "0 (unrated)" },
};

const LOAD_FACTOR: Record<string, { factor: number; basis: "net" | "gross"; use: string }> = {
  "A-2": { factor: 15, basis: "net", use: "unconcentrated assembly with tables and chairs" },
  "A-3": { factor: 15, basis: "net", use: "unconcentrated assembly" },
  B: { factor: 150, basis: "gross", use: "business areas" },
  E: { factor: 20, basis: "net", use: "classrooms" },
  "F-1": { factor: 100, basis: "gross", use: "industrial areas" },
  "F-2": { factor: 100, basis: "gross", use: "industrial areas" },
  M: { factor: 60, basis: "gross", use: "mercantile sales" },
  "R-1": { factor: 200, basis: "gross", use: "residential" },
  "R-2": { factor: 200, basis: "gross", use: "residential" },
  "R-3": { factor: 200, basis: "gross", use: "residential" },
  "S-1": { factor: 300, basis: "gross", use: "storage and stock" },
  "S-2": { factor: 200, basis: "gross", use: "parking garages" },
  U: { factor: 300, basis: "gross", use: "utility and miscellaneous" },
};

type Travel = { ns: number; sprinklered: number; allows13R: boolean; oneExit: number; commonPath: number };

const TRAVEL: Record<string, Travel> = {
  "A-2": { ns: 200, sprinklered: 250, allows13R: true, oneExit: 49, commonPath: 75 },
  "A-3": { ns: 200, sprinklered: 250, allows13R: true, oneExit: 49, commonPath: 75 },
  B: { ns: 200, sprinklered: 300, allows13R: false, oneExit: 49, commonPath: 100 },
  E: { ns: 200, sprinklered: 250, allows13R: true, oneExit: 49, commonPath: 75 },
  "F-1": { ns: 200, sprinklered: 250, allows13R: true, oneExit: 49, commonPath: 100 },
  "F-2": { ns: 300, sprinklered: 400, allows13R: false, oneExit: 49, commonPath: 100 },
  M: { ns: 200, sprinklered: 250, allows13R: true, oneExit: 49, commonPath: 75 },
  "R-1": { ns: 200, sprinklered: 250, allows13R: true, oneExit: 10, commonPath: 75 },
  "R-2": { ns: 200, sprinklered: 250, allows13R: true, oneExit: 20, commonPath: 125 },
  "R-3": { ns: 200, sprinklered: 250, allows13R: true, oneExit: 20, commonPath: 125 },
  "S-1": { ns: 200, sprinklered: 250, allows13R: true, oneExit: 29, commonPath: 100 },
  "S-2": { ns: 300, sprinklered: 400, allows13R: false, oneExit: 29, commonPath: 100 },
  U: { ns: 300, sprinklered: 400, allows13R: false, oneExit: 49, commonPath: 75 },
};

function sprinklerGetsIncrease(profile: ProjectProfile, travel: Travel): boolean {
  if (profile.sprinkler === "nfpa13") return true;
  if (profile.sprinkler === "nfpa13r" && travel.allows13R) return true;
  return false;
}

function formatCellLocal(cell: number | "UL" | null): string {
  return formatAllowable(cell, "ft");
}

function formatStories(cell: number | "UL" | null): string {
  return formatAllowable(cell, "stories");
}

function formatAreaCell(cell: number | "UL" | null): string {
  return formatAllowable(cell, "sf");
}

function mentions(profile: ProjectProfile, pattern: RegExp): boolean {
  return pattern.test(profile.notes);
}

function zoningItem(
  id: string,
  section: string,
  title: string,
  summary: string,
  fallbackRequirements: string[],
  fallbackExceptions: string[],
  topic: ZoningTopic | undefined,
  links: { label: string; url: string }[],
  verifiedSources: { label: string; url: string }[],
): ChecklistItem {
  if (topic?.verified && verifiedSources.length > 0) {
    return item({
      id,
      domain: "zoning",
      section,
      title,
      summary,
      requirements: topic.requirements,
      exceptions: topic.exceptions.length ? topic.exceptions : fallbackExceptions,
      status: "info",
      citation: "verified",
      sources: verifiedSources,
    });
  }
  const requirements = topic?.requirements?.length ? topic.requirements : fallbackRequirements;
  return item({
    id,
    domain: "zoning",
    section,
    title,
    summary: topic?.requirements?.length
      ? `${summary} The note below came back from a reading of the ordinance and is not marked verified.`
      : summary,
    requirements,
    exceptions: topic?.exceptions?.length ? topic.exceptions : fallbackExceptions,
    status: "review",
    citation: "unverified",
    sources: links,
  });
}

export function buildChecklist(profile: ProjectProfile, findings: ZoningFindings | null): ChecklistItem[] {
  const assessment = assessHeightAndArea(profile);
  const codeSource = [modelCodeSource()];
  const typeLabel = profile.constructionType ? CONSTRUCTION_LABELS[profile.constructionType] : "the construction type";
  const groups = occupancyPhrase(profile.occupancy);
  const mixed = profile.occupancy.length > 1;
  const areas = userAreas(profile);
  const primary = profile.occupancy.find((group) => TRAVEL[group]) ?? profile.occupancy[0];
  const travel = primary ? TRAVEL[primary] : undefined;
  const load = primary ? LOAD_FACTOR[primary] : undefined;
  const increased = travel ? sprinklerGetsIncrease(profile, travel) : false;
  const links = zoningSearchLinks(profile);
  const verifiedSources = findings?.sources ?? [];
  const place = jurisdictionLabel(profile) || "the jurisdiction";
  const district = profile.zoningDistrict || "the district";

  const editionLine = assessment.requirements.find((line) => /2021|edition/i.test(line)) ?? "Figures are the unamended 2021 IBC.";
  const limitLines = assessment.limits.map(
    (limit) =>
      `${limit.occupancy}, ${typeLabel}: ${formatCellLocal(limit.feet)} in height (Table 504.3), ${formatStories(limit.stories)} (Table 504.4), ${formatAreaCell(limit.perStory)} per story${limit.total != null ? ` and ${formatAreaCell(limit.total)} for the building` : ""} (Equation 5-1 / 5-2).`,
  );
  const columnNotes = [...new Set(assessment.limits.flatMap((limit) => limit.notes))];

  const heightItem = item({
    id: "ibc-height",
    domain: "building",
    section: "IBC Table 504.3",
    title: "Allowable building height",
    summary: `Height in feet, read for ${groups} in ${typeLabel}.`,
    requirements: [
      editionLine,
      ...limitLines,
      ...assessment.requirements.filter((line) => /^Proposed height|Height in feet isn't/i.test(line)),
      ...columnNotes.filter((line) => /sprinkler|13R|13D|column/i.test(line)),
    ],
    exceptions: assessment.exceptions.filter((line) => /504\.3|510\.2|Rooftop/i.test(line)),
    status: assessment.authoritative ? assessment.heightStatus : "review",
    citation: MODEL,
    sources: codeSource,
  });

  const storyItem = item({
    id: "ibc-stories",
    domain: "building",
    section: "IBC Table 504.4",
    title: "Allowable number of stories",
    summary: "Stories above grade plane. A complying mezzanine is not a story.",
    requirements: [
      ...limitLines,
      ...assessment.requirements.filter((line) => /^Proposed \d|nonseparated|isn't in the desk|Story count isn't/i.test(line)),
    ],
    exceptions: assessment.exceptions.filter((line) => /505|510\.2/i.test(line)),
    status: assessment.authoritative ? assessment.storyStatus : "review",
    citation: MODEL,
    sources: codeSource,
  });

  const areaItem = item({
    id: "ibc-area",
    domain: "building",
    section: "IBC Table 506.2",
    title: "Allowable building area",
    summary: "Equation 5-1 is Aa = At + (NS × If). The frontage increase adds a portion of the nonsprinklered factor. It does not multiply the sprinklered factor.",
    requirements: [
      ...limitLines,
      ...assessment.requirements.filter((line) => /Proposed story area|Proposed building area|split|basis|Building area isn't|Frontage/i.test(line)),
      ...columnNotes.filter((line) => /Frontage|Equation 5-2|three stories|SM factor|13R area/i.test(line)),
    ],
    exceptions: assessment.exceptions.filter((line) => /506\.1\.3|507|508\.4|508\.2/i.test(line)),
    status: assessment.authoritative ? assessment.areaStatus : "review",
    citation: MODEL,
    sources: codeSource,
  });

  const separation = item({
    id: "ibc-separation",
    domain: "building",
    section: "IBC 508",
    title: "Occupancy separation",
    summary: mixed
      ? `${groups} share this building. Choose nonseparated, separated, or accessory, and design to that choice.`
      : "One occupancy is on the file. Keep this in case a second use shows up.",
    requirements: mixed
      ? [
          "Nonseparated occupancies (508.3): no fire barrier is required between the groups, and the stricter height, area, and Chapter 9 requirement applies to the building. Dwelling and sleeping units are still separated under Section 420.",
          "Separated occupancies (508.4): provide the fire barrier or horizontal assembly in Table 508.4. Use the sprinkler column of that table only for NFPA 13 throughout. On each story, the sum of each group's actual area divided by its allowable area cannot exceed 1.",
          "Incidental uses (509) are not occupancies. Larger furnace and boiler rooms, refrigerant machinery rooms, waste rooms, and laundry rooms take the separation or the sprinklers listed in Table 509.",
        ]
      : [
          "A single occupancy still has incidental-use rooms under Section 509 and Table 509. Those rooms are not a second occupancy group.",
          "If a second group is added, decide among accessory (508.2, at most 10% of the story), nonseparated (508.3), and separated (508.4) before the height and area comparison is final.",
        ],
    exceptions: [
      "Accessory occupancies do not need a separation from the main occupancy and are classified with it for height and area, provided they stay within the 10% limit and are not among the uses 508.2 excludes.",
      "Parking under Group R is often handled by the special provisions in Section 510 rather than by a plain Table 508.4 separation.",
    ],
    applies: mixed,
    status: mixed ? "review" : "info",
    citation: MODEL,
    sources: codeSource,
  });

  const rating = profile.constructionType ? RATINGS[profile.constructionType] : undefined;
  const fire = item({
    id: "ibc-fire-resistance",
    domain: "building",
    section: "IBC Table 601",
    title: "Fire resistance of building elements",
    summary: rating
      ? `${typeLabel} sets the hourly ratings of the frame, bearing walls, floors, and roof.`
      : "Table 601 needs a construction type.",
    requirements:
      rating && rating !== "mass-timber"
        ? [
            `Primary structural frame: ${rating.frame}.`,
            `Exterior bearing walls: ${rating.bearingExt}. Interior bearing walls: ${rating.bearingInt}.`,
            `Floor construction: ${rating.floor}. Roof construction: ${rating.roof}.`,
            "Every listed element has to meet or exceed the table. Exterior nonbearing walls are rated by fire separation distance, not by this table.",
          ]
        : rating === "mass-timber"
          ? [
              `${typeLabel} is a mass-timber type. Read the frame, wall, floor, and roof cells in Table 601, then apply the encapsulation and exposed-timber limits in Section 602.4.`,
              "Do not treat IV-A, IV-B, or IV-C as heavy timber. Heavy timber is the IV-HT column, with the member sizes in Section 2304.11.",
            ]
          : ["Set the construction type to read Table 601."],
    exceptions: [
      "Nonbearing interior partitions are generally unrated.",
      "The roof rating may be reduced where every part of the roof is at least 20 feet above the floor below, except for the occupancies the table footnote excludes.",
      "Type IV-HT members are sized as heavy timber instead of receiving a tested hourly rating.",
    ],
    status: rating ? "info" : "review",
    citation: MODEL,
    sources: codeSource,
  });

  const exterior = item({
    id: "ibc-exterior",
    domain: "building",
    section: "IBC Table 705.5",
    title: "Exterior wall ratings",
    summary: "In the 2021 IBC this table moved from Table 602 to Table 705.5. The rating follows fire separation distance and occupancy, not construction type.",
    requirements: [
      "Measure fire separation distance at a right angle from the wall to the nearest interior lot line, to the far side of a public way, or to an imaginary line between buildings on the same lot.",
      "At 30 feet or more, most occupancies are unrated. Inside that distance a rating and opening limits usually apply, and Groups F-1, M, and S-1 are stricter than Groups B and R.",
      "This file has no fire-separation distance, so the hours are not calculated.",
    ],
    exceptions: [
      "Some ratings drop when the building is sprinklered throughout. Read the table footnotes before taking that reduction, especially under 10 feet.",
      "Projections, opening protectives, and the combustible cladding limits in Section 1405 sit on top of the wall rating.",
    ],
    status: "review",
    citation: MODEL,
    sources: codeSource,
  });

  const sprinklerLines = sprinklerRequirements(profile, areas.perStory);
  const sprinklers = item({
    id: "ibc-sprinklers",
    domain: "building",
    section: "IBC 903",
    title: "Where sprinklers are required",
    summary: "Chapter 9 decides whether a system is required. Tables 504 and 506 only describe the benefit if you provide one.",
    requirements: sprinklerLines.requirements,
    exceptions: sprinklerLines.exceptions,
    status: sprinklerLines.status,
    citation: MODEL,
    sources: codeSource,
  });

  const egressLines: string[] = [];
  if (travel && primary) {
    const distance = increased ? travel.sprinklered : travel.ns;
    const systemNote =
      profile.sprinkler === "nfpa13r" && !travel.allows13R
        ? " NFPA 13R does not take the longer travel distance for this group; Table 1017.2 gives that increase to an NFPA 13 system."
        : increased
          ? " The sprinkler column applies."
          : " The nonsprinklered column applies.";
    egressLines.push(
      `Exit access travel distance for Group ${primary} is ${distance} feet.${systemNote} Measure along the natural path, not in a straight line (Table 1017.2).`,
    );
    egressLines.push(
      `A space can have one exit only while the occupant load stays at or under ${travel.oneExit} and the common path stays within Table 1006.2.1. With the sprinkler system this file describes, common path for Group ${primary} is ${travel.commonPath} feet.`,
    );
  } else {
    egressLines.push("Table 1017.2 and Table 1006.2.1 need an occupancy group before travel distance and the single-exit limit can be read.");
  }
  if (load && areas.perStory) {
    const estimate = Math.ceil(areas.perStory / load.factor);
    const exitCount = estimate > 1000 ? 4 : estimate > 500 ? 3 : 2;
    egressLines.push(
      load.basis === "net"
        ? `A planning load using ${load.factor} sf per person net (${load.use}) on the whole ${formatSqFt(areas.perStory)} story is about ${formatNumber(estimate)} people. That overstates the load, because net area leaves out walls, shafts, and corridors. At that ceiling the story wants ${exitCount} exits.`
        : `A planning load using ${load.factor} sf per person gross (${load.use}) on ${formatSqFt(areas.perStory)} is about ${formatNumber(estimate)} occupants. At that load, Section 1006 calls for ${exitCount} exits from the story once you are past the narrow single-exit cases.`,
    );
  } else {
    egressLines.push("Occupant load is still a room-by-room Table 1004.5 calculation. The factors above are only a planning check.");
  }
  egressLines.push(
    "Stairs are 0.3 inch per occupant, or 0.2 inch when the building is sprinklered throughout and has emergency voice/alarm communication. Other egress components are 0.2 inch, or 0.15 inch under that same pair of conditions (Section 1005.3). Corridor and stair width is 44 inches when serving 50 or more occupants, otherwise 36 inches.",
  );

  const egress = item({
    id: "ibc-egress",
    domain: "building",
    section: "IBC Chapter 10",
    title: "Means of egress",
    summary: "Occupant load, number of exits, travel distance, and width. The load here is a planning estimate until rooms are assigned.",
    requirements: egressLines,
    exceptions: [
      "An exterior egress balcony can add up to 100 feet of travel distance when it is the last part of the path (Section 1017.2.1).",
      "Groups F-1 and S-1 can reach 400 feet in a one-story sprinklered building with a 24-foot clear height (Section 1017.2.2).",
      "Dead-end corridors are 20 feet, with a 50-foot allowance in certain sprinklered Group B, F, M, and S buildings (Section 1020.4).",
      "Three exits are required from 501 to 1,000 occupants, and four above 1,000, for both spaces and stories.",
    ],
    status: travel ? "review" : "review",
    citation: MODEL,
    sources: codeSource,
  });

  const accessible = item({
    id: "ibc-accessibility",
    domain: "building",
    section: "IBC Chapter 11",
    title: "Accessibility",
    summary: "Chapter 11 is the scoping. ICC A117.1 is the technical standard. The Fair Housing Act can ask for more in residential buildings.",
    requirements: [
      "Provide an accessible route from site arrival points to an accessible entrance, and from there to the primary function areas and accessible toilet rooms.",
      "At least 60% of public entrances are accessible, with accessible parking scoped by Section 1106.",
      profile.occupancy.includes("R-2")
        ? "In Group R-2 with more than 20 dwelling units, at least 2% (and not less than one) are Type A units. Buildings with four or more units also owe Type B units under Section 1108, subject to the multistory and site-impracticality exceptions."
        : "Dwelling units and sleeping units, where they exist, are scoped by Section 1108, including Type A and Type B units when the count thresholds are met.",
      "Operable parts, toilets, kitchens, and signage follow A117.1 once Chapter 11 says the space is required to be accessible.",
    ],
    exceptions: [
      "Employee work areas are scoped more narrowly than public areas, but the route to them is still required.",
      "Existing buildings and alterations follow the existing building code's accessibility chapter, which is not a free pass to skip a primary-function area.",
      "Type B unit counts can drop for site impracticality, certain multistory units, and buildings without an elevator when the code allows it. Document the exception; don't assume it.",
    ],
    status: "info",
    citation: MODEL,
    sources: codeSource,
  });

  const highRiseCandidate = (profile.heightFt ?? 0) > 75 || (profile.heightFt == null && (profile.stories ?? 0) >= 7);
  const highRise = item({
    id: "ibc-high-rise",
    domain: "building",
    section: "IBC 403",
    title: "High-rise buildings",
    summary: "A high-rise has an occupied floor more than 75 feet above the lowest level of fire department vehicle access.",
    requirements: [
      profile.heightFt != null
        ? `The file lists ${profile.heightFt} feet. The 75-foot measurement is to the highest occupied floor, not the roof. ${profile.heightFt > 75 ? "This is over that line until you show the occupied floor is lower." : "This sits under the line if the number is the occupied floor or the roof."}`
        : "Height in feet isn't set. Seven or more stories often lands near the 75-foot line and should be measured.",
      "High-rise buildings owe sprinklers, a fire command center, standby power, stair and elevator protection, and a fire service access elevator, with reductions for buildings under 120 feet and for some open parking.",
    ],
    exceptions: [
      "The threshold is the highest occupied floor, so a tall roof screen or an unoccupied mechanical penthouse does not by itself make a high-rise.",
      "Open parking garages and certain Group A-5 buildings are excluded from portions of Section 403.",
    ],
    applies: highRiseCandidate || profile.heightFt != null,
    status: profile.heightFt == null ? "review" : profile.heightFt > 75 ? "exceeds" : "within",
    citation: MODEL,
    sources: codeSource,
  });

  const podiumWanted = mentions(profile, /podium|510/) || (assessment.authoritative && assessment.storyStatus === "exceeds");
  const podium = item({
    id: "ibc-podium",
    domain: "building",
    section: "IBC 510.2",
    title: "Podium / horizontal separation",
    summary: "A 3-hour horizontal separation can make the building above its own building for height and area.",
    requirements: [
      "The construction below the separation is Type I-A, and the separation is a 3-hour horizontal assembly.",
      "Shafts, stairs, and other vertical openings through the separation are protected as the section requires. The building above is then measured from the separation, not from grade.",
      "The upper building still has to fit the story and height tables for its own construction type and occupancy. Uncheck this if a podium is not the strategy.",
    ],
    exceptions: [
      "Section 510 has other special provisions — parking podiums, Group R over S-2, and Group S-2 under an open parking garage — with their own conditions. 510.2 is the general horizontal-building-separation allowance.",
    ],
    applies: podiumWanted,
    status: "info",
    citation: MODEL,
    sources: codeSource,
  });

  const existing = item({
    id: "ibc-existing",
    domain: "building",
    section: "IEBC",
    title: "Existing building",
    summary: "Additions, alterations, and changes of occupancy are not judged only under the IBC for new buildings.",
    requirements: [
      "Identify the IEBC compliance path: prescriptive, work area, or performance. The path changes which chapters apply.",
      "A change of occupancy is tested against the new group's height, area, fire protection, and egress, with the IEBC's specific allowances where the existing building cannot meet the IBC outright.",
      "An addition is usually required to meet the IBC, and the existing-plus-addition building cannot push the existing portion into a violation.",
    ],
    exceptions: [
      "Like-for-like repairs can stay in the repairs chapter and avoid a full upgrade.",
      "Accessibility upgrades in alterations are scoped by the IEBC, often tied to the cost and the primary function area, rather than to a full Chapter 11 renovation.",
    ],
    applies: profile.scope === "addition" || profile.scope === "alteration" || profile.scope === "change-of-occupancy" || mentions(profile, /existing|alteration|renovat/),
    status: "review",
    citation: MODEL,
    sources: codeSource,
  });

  const mezzanine = item({
    id: "ibc-mezzanine",
    domain: "building",
    section: "IBC 505",
    title: "Mezzanines",
    summary: "A complying mezzanine is part of the story below. It does not add a story or building area, and it does count toward the fire area.",
    requirements: [
      "Aggregate mezzanine area is limited to one-third of the room it sits in. The enclosed portion of the room is left out of that calculation.",
      "Clear height above and below the mezzanine floor is at least 7 feet.",
      "The mezzanine needs its own egress, and its occupant load is added to the story.",
    ],
    exceptions: [
      "The limit rises to one-half of the room in sprinklered Type I or II buildings that also have emergency voice/alarm communication.",
      "A mezzanine inside a dwelling unit can also reach one-half when the building is sprinklered with NFPA 13 or 13R.",
      "Special industrial occupancies in Type I or II can reach two-thirds.",
    ],
    applies: mentions(profile, /mezzanine/),
    status: "info",
    citation: MODEL,
    sources: codeSource,
  });

  const useFallback = [
    district === "the district"
      ? `The zoning district isn't on the file. Look up the parcel and record whether ${groups} is permitted, conditional, or prohibited.`
      : `Confirm whether ${groups} is permitted, conditional, or prohibited in ${district}. Cite the use table, not a general description of the district.`,
    "If the use is conditional, list the criteria and who decides. If it is prohibited, the path is a rezoning or a different use, not a variance from a use standard in many codes.",
  ];
  const useItem = zoningItem(
    "zoning-use",
    "Zoning — use",
    "Permitted use",
    `Use permission in ${place}.`,
    useFallback,
    ["Legal nonconforming uses can sometimes continue, and often cannot expand, change, or rebuild after damage. Read the nonconforming chapter before relying on that."],
    findings?.use,
    links,
    verifiedSources,
  );

  const heightZ = zoningItem(
    "zoning-height",
    "Zoning — height",
    "District height limit",
    `Building height allowed in ${district}. This is separate from IBC Table 504.3, and the stricter one governs.`,
    [
      `Find the maximum height and, if the district regulates them, the maximum stories in ${district}.`,
      profile.heightFt != null || profile.stories != null
        ? `The project is ${[profile.stories != null ? `${profile.stories} stories` : "", profile.heightFt != null ? `${profile.heightFt} feet` : ""].filter(Boolean).join(" and ")}. Compare both numbers with the district, and watch how the ordinance measures height — grade, average grade, or datum.`
        : "Height isn't on the file yet. Add it before calling the district limit met or missed.",
    ],
    [
      "Some districts allow extra height for a pitched roof, a parapet, rooftop mechanical equipment, or a housing bonus. Each of those is an exception with its own conditions.",
      "Overlay districts and design guidelines can impose a lower height than the base district.",
    ],
    findings?.height,
    links,
    verifiedSources,
  );

  const setbacks = zoningItem(
    "zoning-setbacks",
    "Zoning — setbacks",
    "Setbacks and yards",
    `Front, side, and rear yards in ${district}.`,
    [
      "Record the required front, side, and rear setbacks, and whether they are measured to the property line, the curb, or the centerline.",
      "Corner lots often have two front yards. Through lots often do too.",
    ],
    [
      "Common exceptions include open porches, eaves, accessibility ramps, and bay windows, each with a maximum projection.",
      "A recorded easement or a future street widening can demand more than the zoning yard.",
    ],
    findings?.setbacks,
    links,
    verifiedSources,
  );

  const far = zoningItem(
    "zoning-far",
    "Zoning — intensity",
    "Floor area ratio",
    `FAR or floor-area limit in ${district}.`,
    [
      "Find the base FAR and which floor area counts. Basements, parking, and balconies are often excluded or counted at a fraction.",
      areas.total != null && profile.lotSqFt
        ? `A rough FAR using ${formatSqFt(areas.total)} of building on a ${formatSqFt(profile.lotSqFt)} lot is ${(areas.total / profile.lotSqFt).toFixed(2)}. Confirm that both numbers match the ordinance's definitions before treating that as the project's FAR.`
        : "Lot area and building area are both needed before a project FAR can be compared with the district.",
    ],
    [
      "Bonuses for affordable housing, plazas, or transit are exceptions with a process, not automatic area.",
      "Some codes regulate density in units per acre instead of FAR, or in addition to it.",
    ],
    findings?.far,
    links,
    verifiedSources,
  );

  const coverage = zoningItem(
    "zoning-coverage",
    "Zoning — coverage",
    "Lot coverage",
    `Building coverage and, where the code has it, impervious coverage in ${district}.`,
    [
      profile.lotSqFt
        ? `The lot is ${formatSqFt(profile.lotSqFt)}. Coverage is building footprint divided by lot area — not the same number as FAR.`
        : "Lot area isn't on the file, so coverage can't be checked yet.",
      "Read whether decks, eaves, and detached garages count toward coverage.",
    ],
    ["Some districts exempt a portion of a porch or an accessibility improvement from coverage."],
    findings?.coverage,
    links,
    verifiedSources,
  );

  const parking = zoningItem(
    "zoning-parking",
    "Zoning — parking",
    "Parking and loading",
    `Minimum or maximum parking in ${district}. Many cities have reduced or removed minimums.`,
    [
      "Find the parking ratio for each use on the file, the rounding rule, and whether the district is inside an area with no minimum.",
      "Accessible parking is an IBC Chapter 11 requirement even when the zoning code requires no other stalls.",
      "Bicycle parking, loading berths, and driveways are often in the same chapter and are easy to miss.",
    ],
    [
      "Shared parking, on-street credit, and transit reductions are exceptions. They usually need a signed agreement or a map designation.",
      "Change of occupancy can trigger parking even when the building isn't growing. The nonconforming-parking section sometimes protects the existing count.",
    ],
    findings?.parking,
    links,
    verifiedSources,
  );

  const overlay = zoningItem(
    "zoning-overlay",
    "Zoning — overlays",
    "Overlay districts",
    profile.overlays.length
      ? `Overlays on the file: ${profile.overlays.join(", ")}. These modify the base district.`
      : "No overlays were named. Confirm the map anyway — flood, historic, and design overlays are often missed.",
    profile.overlays.length
      ? profile.overlays.map((overlayName) => `Read the ${overlayName} overlay for standards that add to, or replace, ${district}: use limits, height, materials, review process, and any certificate that has to be issued before the building permit.`)
      : ["Check the zoning map for historic, flood, design-review, transit, hillside, airport, and coastal overlays. Record “none” in the notes once the map is confirmed."],
    [
      "A flood overlay brings the local floodplain ordinance and, usually, elevation and flood-vent rules that the zoning district does not contain.",
      "Historic overlays often require a certificate of appropriateness for exterior work even when the use and the height already comply.",
    ],
    findings?.overlay,
    links,
    verifiedSources,
  );

  return [
    heightItem,
    storyItem,
    areaItem,
    separation,
    fire,
    exterior,
    sprinklers,
    egress,
    accessible,
    highRise,
    podium,
    existing,
    mezzanine,
    useItem,
    heightZ,
    setbacks,
    far,
    coverage,
    parking,
    overlay,
  ];
}

function sprinklerRequirements(profile: ProjectProfile, perStory: number | null): {
  requirements: string[];
  exceptions: string[];
  status: ChecklistItem["status"];
} {
  const requirements: string[] = [];
  const area = perStory ?? profile.areaSqFt;
  let status: ChecklistItem["status"] = "info";
  const none = profile.sprinkler === "none";

  if (profile.occupancy.includes("R-1") || profile.occupancy.includes("R-2") || profile.occupancy.includes("R-3")) {
    requirements.push("New Group R is sprinklered throughout under Section 903.2.8. NFPA 13R is limited to four stories and 60 feet (Section 903.3.1.2). NFPA 13D is limited to certain one- and two-family and townhouse buildings (Section 903.3.1.3). Anything taller needs NFPA 13.");
    if (none) status = "exceeds";
    if (profile.sprinkler === "nfpa13r" && ((profile.stories ?? 0) > 4 || (profile.heightFt ?? 0) > 60)) status = "exceeds";
  }
  if (profile.occupancy.includes("A-2")) {
    requirements.push("Group A-2 requires sprinklers throughout the story, and down to the level of exit discharge, when the fire area exceeds 5,000 sf, the occupant load is 100 or more, or the use is not on the level of exit discharge (Section 903.2.1.2).");
    if (none && area != null && area > 5000) status = "exceeds";
  }
  if (profile.occupancy.includes("A-3")) {
    requirements.push("Group A-3 requires sprinklers when the fire area exceeds 12,000 sf, the occupant load is 300 or more, or the use is not on the level of exit discharge (Section 903.2.1.3).");
    if (none && area != null && area > 12000) status = "exceeds";
  }
  if (profile.occupancy.includes("M")) {
    requirements.push("Group M requires sprinklers throughout when a fire area exceeds 12,000 sf, a fire area is four or more stories above grade, the aggregate of M fire areas exceeds 24,000 sf, or merchandise is in high-piled storage (Section 903.2.7).");
    if (none && ((area != null && area > 12000) || (profile.stories ?? 0) >= 4)) status = "exceeds";
  }
  if (profile.occupancy.includes("B") && !profile.occupancy.some((group) => group !== "B")) {
    requirements.push("Group B is not generally required to be sprinklered by Section 903.2.2. The triggers that do apply are ambulatory care, a high-rise under Section 403, and any height or area increase you want from the S column.");
  }
  if (profile.occupancy.includes("E")) {
    requirements.push("Group E requires sprinklers when the fire area exceeds 12,000 sf, the occupant load is 300 or more, or the use is below the level of exit discharge (Section 903.2.3). Classrooms with an exterior exit door at grade can be an exception to the below-grade trigger.");
  }
  if (profile.occupancy.includes("S-1") || profile.occupancy.includes("F-1")) {
    requirements.push("Groups F-1 and S-1 require sprinklers when a fire area exceeds 12,000 sf, is four or more stories above grade, or when the aggregate fire area exceeds 24,000 sf. S-1 has extra triggers for commercial trucks and repair garages (Sections 903.2.4 and 903.2.9).");
  }
  if (requirements.length === 0) {
    requirements.push("Section 903.2 sets sprinkler thresholds by occupancy, fire area, occupant load, and whether the use is on the level of exit discharge. Add an occupancy group to read the specific trigger.");
    status = "review";
  }
  if (profile.sprinkler === "unknown" || profile.sprinkler === "") {
    requirements.push("The sprinkler system isn't chosen, so the NS column was used for height and area.");
    if (status === "info") status = "review";
  }
  return {
    requirements,
    exceptions: [
      "Open parking garages, certain Group U buildings, and a few small residential conditions have narrower sprinkler rules. They are exceptions, not the default.",
      "A sprinkler system that doesn't cover the whole building does not earn the S, S1, or SM column in Tables 504 and 506.",
    ],
    status,
  };
}

export function preserveChecklistEdits(previous: ChecklistItem[], next: ChecklistItem[]): ChecklistItem[] {
  const prior = new Map(previous.map((item) => [item.id, item]));
  return next.map((item) => {
    const old = prior.get(item.id);
    if (!old) return item;
    return { ...item, applies: old.applies, notes: old.notes };
  });
}
