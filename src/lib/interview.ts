import { CONSTRUCTION_LABELS, formatFeet, formatNumber, formatSqFt } from "@/lib/format";
import { KNOWN_OCCUPANCIES } from "@/lib/ibc-tables";
import type { ConstructionType, ProjectProfile, ProjectScope, QuestionId, Sprinkler } from "@/lib/types";
import { CONSTRUCTION_TYPES } from "@/lib/types";

export type Question = {
  id: QuestionId;
  prompt: string;
  hint: string;
  suggestions: string[];
};

export type ApplyResult =
  | { ok: true; profile: ProjectProfile; acknowledgement: string; skip?: boolean }
  | { ok: false; profile: ProjectProfile; clarification: string };

export const QUESTIONS: Question[] = [
  {
    id: "identity",
    prompt: "What should we call this one — a project name, or the street address?",
    hint: "Either one is enough to title the report.",
    suggestions: ["412 East Pine Street", "Harbor Office TI"],
  },
  {
    id: "jurisdiction",
    prompt: "Who has jurisdiction? Give me the city or county, and the state.",
    hint: "Zoning has to be read from a real ordinance, so the place matters.",
    suggestions: ["Seattle, WA", "Austin, Texas", "King County, Washington"],
  },
  {
    id: "occupancy",
    prompt: "What's the occupancy? An IBC use group is ideal — B, R-2, A-2, M — or describe it. List every group if there's more than one.",
    hint: "Plain language works. Restaurant, apartments over retail, office.",
    suggestions: ["B office", "R-2 apartments", "A-2 restaurant", "R-2 apartments over M retail"],
  },
  {
    id: "construction",
    prompt: "Construction type? IA through VB, including IV-A, IV-B, IV-C, or heavy timber.",
    hint: "This picks the column in the height, area, and fire-resistance tables.",
    suggestions: ["Type II-A", "Type III-A", "Type V-A", "Type V-B"],
  },
  {
    id: "zoning",
    prompt: "Which zoning district is on the parcel?",
    hint: "The map designation, such as NC3-75 or R-1. Skip it if you don't have the map yet.",
    suggestions: ["NC3-75", "C-2", "Not sure"],
  },
  {
    id: "overlays",
    prompt: "Any overlay districts — historic, flood, design review, transit — or none?",
    hint: "Overlays often outrank the base district.",
    suggestions: ["None", "Historic", "Flood", "Design review"],
  },
  {
    id: "height",
    prompt: "How tall is it, and how many stories above grade plane?",
    hint: "Feet and stories are separate limits. One of them is enough to keep going.",
    suggestions: ["4 stories, 48 feet", "6 stories, 68 feet", "2 stories"],
  },
  {
    id: "area",
    prompt: "What's the building area, in square feet? Say whether that's one story or the whole building.",
    hint: "A per-story number is the one Table 506.2 compares.",
    suggestions: ["12,000 sf per story", "25,000 sf total"],
  },
  {
    id: "sprinkler",
    prompt: "Sprinklers — NFPA 13, 13R, 13D, or none?",
    hint: "The tables only give the increase for the system they name. “Yes” is read as NFPA 13.",
    suggestions: ["NFPA 13", "NFPA 13R", "NFPA 13D", "None"],
  },
  {
    id: "lot",
    prompt: "Lot size? Square feet or acres, and a width if you have it.",
    hint: "Used for coverage and the zoning outline. Skip if you don't have the survey.",
    suggestions: ["15,000 sf", "0.34 acres", "50 by 120 feet"],
  },
  {
    id: "frontage",
    prompt: "For the area increase in IBC 506.3: what percentage of the perimeter has at least 20 feet of open yard or public way, and how wide is the narrowest of those?",
    hint: "Skip this if you don't know. The area check will assume no increase.",
    suggestions: ["50 percent, 40 feet", "Not sure"],
  },
  {
    id: "scope",
    prompt: "Is this new construction, an addition, an alteration, or a change of occupancy?",
    hint: "Alterations and changes of occupancy also pull in the existing building code.",
    suggestions: ["New building", "Addition", "Alteration", "Change of occupancy"],
  },
  {
    id: "notes",
    prompt: "Anything else a reviewer will ask about — a podium, a mezzanine, an existing building — or none?",
    hint: "This is the last question. I'll draft the checklist after it.",
    suggestions: ["None", "Podium at grade", "Mezzanine in the restaurant"],
  },
];

export function questionById(id: QuestionId): Question {
  const question = QUESTIONS.find((item) => item.id === id);
  if (!question) throw new Error(`Unknown question ${id}`);
  return question;
}

export function nextQuestion(profile: ProjectProfile, skipped: QuestionId[]): Question | null {
  for (const question of QUESTIONS) {
    if (skipped.includes(question.id)) continue;
    if (!isAnswered(profile, question.id)) return question;
  }
  return null;
}

export function isAnswered(profile: ProjectProfile, id: QuestionId): boolean {
  switch (id) {
    case "identity":
      return Boolean(profile.name.trim() || profile.address.trim());
    case "jurisdiction":
      return Boolean(profile.state.trim() && (profile.city.trim() || profile.county.trim()));
    case "occupancy":
      return profile.occupancy.length > 0;
    case "construction":
      return profile.constructionType !== "";
    case "zoning":
      return profile.zoningDistrict.trim() !== "";
    case "overlays":
      return profile.overlays.length > 0;
    case "height":
      return profile.stories != null || profile.heightFt != null;
    case "area":
      return profile.areaSqFt != null && (profile.areaBasis !== "" || profile.stories === 1);
    case "sprinkler":
      return profile.sprinkler !== "";
    case "lot":
      return profile.lotSqFt != null;
    case "frontage":
      return profile.frontagePercent != null && profile.openSpaceFt != null;
    case "scope":
      return profile.scope !== "";
    case "notes":
      return profile.notes.trim() !== "";
    default:
      return false;
  }
}

export function canDraft(profile: ProjectProfile): boolean {
  return profile.occupancy.length > 0 || profile.zoningDistrict.trim() !== "" || profile.constructionType !== "";
}

function genericSkip(text: string): boolean {
  return /^(skip|pass|next|not sure|unsure|unknown|idk|i don't know|i dont know|don't know|do not know|n\/a|na|later)$/i.test(
    text.trim(),
  );
}

function clean(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

const STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const STATE_NAMES = Object.values(STATES).sort((a, b) => b.length - a.length);

function lookupState(token: string): string | null {
  const trimmed = token.trim().replace(/\./g, "");
  const abbr = trimmed.toUpperCase();
  if (STATES[abbr]) return STATES[abbr];
  const lower = token.trim().toLowerCase();
  return STATE_NAMES.find((name) => name.toLowerCase() === lower) ?? null;
}

export function parseJurisdiction(input: string): { city: string; county: string; state: string } | null {
  const text = clean(input).replace(/\./g, "");
  if (!text) return null;
  if (/^(washington,?\s*)?dc$/i.test(text) || /washington,?\s*dc$/i.test(text)) {
    return { city: "Washington", county: "", state: "District of Columbia" };
  }
  if (/^nyc$|new york city/i.test(text)) {
    return { city: "New York", county: "", state: "New York" };
  }

  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  let state = "";
  const places: string[] = [];

  if (parts.length > 1) {
    for (const part of parts) {
      const found = lookupState(part);
      if (found && !state) state = found;
      else places.push(part);
    }
  } else {
    const lower = text.toLowerCase();
    const matched = STATE_NAMES.find((name) => lower === name.toLowerCase() || lower.endsWith(` ${name.toLowerCase()}`));
    if (matched && lower === matched.toLowerCase()) {
      state = matched;
    } else if (matched) {
      state = matched;
      places.push(text.slice(0, text.length - matched.length).replace(/,/g, "").trim());
    } else {
      const words = text.split(" ");
      const last = lookupState(words[words.length - 1] ?? "");
      if (last && words.length > 1) {
        state = last;
        places.push(words.slice(0, -1).join(" "));
      } else {
        places.push(text);
      }
    }
  }

  let city = "";
  let county = "";
  for (const place of places) {
    if (!place) continue;
    if (/county/i.test(place)) county = place.replace(/\s+county$/i, " County").replace(/^county\s+/i, "");
    else if (!city) city = place;
  }
  if (!city && !county && !state) return null;
  return { city, county, state };
}

const GROUP_PATTERN =
  /\b(A\s*-?\s*[1-5]|I\s*-?\s*[1-4]|R\s*-?\s*[1-4]|F\s*-?\s*[12]|H\s*-?\s*[1-5]|S\s*-?\s*[12]|B|E|M|U)\b/gi;

function normalizeGroup(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[\s-]+/g, "");
  const match = compact.match(/^([A-Z])(\d)?$/);
  if (!match) return null;
  const group = match[2] ? `${match[1]}-${match[2]}` : match[1];
  if (group === "B" || group === "E" || group === "M" || group === "U" || KNOWN_OCCUPANCIES.includes(group) || /^(A-[1-5]|I-[1-4]|R-[1-4]|F-[12]|H-[1-5]|S-[12])$/.test(group)) {
    return group;
  }
  return null;
}

const OCCUPANCY_KEYWORDS: [RegExp, string][] = [
  [/\b(apartments?|multifamily|multi-family|dwelling units)\b/i, "R-2"],
  [/\b(hotel|motel)\b/i, "R-1"],
  [/\b(townhouses?|townhomes?|duplex|single-family|one-family)\b/i, "R-3"],
  [/\b(offices?)\b/i, "B"],
  [/\b(restaurants?|dining|cafe|café|tavern|bar)\b/i, "A-2"],
  [/\b(retail|mercantile|store|shop)\b/i, "M"],
  [/\b(school|classroom)\b/i, "E"],
  [/\b(warehouses?)\b/i, "S-1"],
  [/\b(parking)\b/i, "S-2"],
  [/\b(factory|manufacturing|industrial)\b/i, "F-1"],
  [/\b(theater|theatre|gymnasium|lecture)\b/i, "A-3"],
];

export function parseOccupancy(text: string): string[] {
  const found: string[] = [];
  const add = (group: string | null) => {
    if (group && !found.includes(group)) found.push(group);
  };
  const codes = text.match(GROUP_PATTERN) ?? [];
  for (const code of codes) add(normalizeGroup(code));
  for (const [pattern, group] of OCCUPANCY_KEYWORDS) {
    if (pattern.test(text)) add(group);
  }
  return found;
}

const CONSTRUCTION_PATTERNS: [RegExp, ConstructionType][] = [
  [/\b(?:type\s*)?(?:iv|4)\s*-?\s*(?:ht|heavy\s*timber)\b/i, "IVHT"],
  [/\bheavy\s*timber\b/i, "IVHT"],
  [/\b(?:type\s*)?(?:iv|4)\s*-?\s*a\b/i, "IVA"],
  [/\biv-?a\b/i, "IVA"],
  [/\b(?:type\s*)?(?:iv|4)\s*-?\s*b\b/i, "IVB"],
  [/\biv-?b\b/i, "IVB"],
  [/\b(?:type\s*)?(?:iv|4)\s*-?\s*c\b/i, "IVC"],
  [/\biv-?c\b/i, "IVC"],
  [/\b(?:type\s*)?(?:iii|3)\s*-?\s*a\b/i, "IIIA"],
  [/\biii-?a\b/i, "IIIA"],
  [/\b(?:type\s*)?(?:iii|3)\s*-?\s*b\b/i, "IIIB"],
  [/\biii-?b\b/i, "IIIB"],
  [/\b(?:type\s*)?(?:ii|2|two)\s*-?\s*a\b/i, "IIA"],
  [/\bii-?a\b/i, "IIA"],
  [/\b(?:type\s*)?(?:ii|2|two)\s*-?\s*b\b/i, "IIB"],
  [/\bii-?b\b/i, "IIB"],
  [/\b(?:type\s*)?(?:v|5|five)\s*-?\s*a\b/i, "VA"],
  [/\bv-?a\b/i, "VA"],
  [/\b(?:type\s*)?(?:v|5|five)\s*-?\s*b\b/i, "VB"],
  [/\bv-?b\b/i, "VB"],
  [/\b(?:type\s*)?(?:i|1|one)\s*-?\s*a\b/i, "IA"],
  [/\bi-?a\b/i, "IA"],
  [/\b(?:type\s*)?(?:i|1|one)\s*-?\s*b\b/i, "IB"],
  [/\bi-?b\b/i, "IB"],
  [/\btype\s*(?:iv|4)\b/i, "IVHT"],
];

export function parseConstruction(text: string): ConstructionType | null {
  for (const [pattern, type] of CONSTRUCTION_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const alias: Record<string, ConstructionType> = {
    IA: "IA",
    IB: "IB",
    IIA: "IIA",
    "2A": "IIA",
    IIB: "IIB",
    "2B": "IIB",
    IIIA: "IIIA",
    "3A": "IIIA",
    IIIB: "IIIB",
    "3B": "IIIB",
    IVA: "IVA",
    "4A": "IVA",
    IVB: "IVB",
    "4B": "IVB",
    IVC: "IVC",
    "4C": "IVC",
    IVHT: "IVHT",
    VA: "VA",
    "5A": "VA",
    VB: "VB",
    "5B": "VB",
  };
  if (CONSTRUCTION_TYPES.includes(compact as ConstructionType)) return compact as ConstructionType;
  return alias[compact] ?? null;
}

export function parseSprinkler(text: string): Sprinkler | "partial" | null {
  const value = text.trim();
  if (/^(no|nope|nah)$/i.test(value) || /\b(none|unsprinklered|not sprinklered|no sprinklers?|without sprinklers?)\b/i.test(value)) {
    return "none";
  }
  if (/\b13\s*-?\s*d\b|\bnfpa\s*13\s*d\b/i.test(value)) return "nfpa13d";
  if (/\b13\s*-?\s*r\b|\bnfpa\s*13\s*r\b/i.test(value)) return "nfpa13r";
  if (/\bpartial\b/i.test(value)) return "partial";
  if (/\bnfpa\s*13\b|\bfully sprinklered\b|\bsprinklered throughout\b|\bsprinklers?\b|\byes\b/i.test(value)) return "nfpa13";
  return null;
}

const STORY_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function numberFrom(raw: string): number | null {
  const word = STORY_WORDS[raw.toLowerCase()];
  if (word) return word;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseHeight(text: string): { stories: number | null; heightFt: number | null } {
  const storyMatch = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s*-?\s*(?:stories|story|floors|floor)\b/i,
  );
  const feetMatch = text.match(/\b(\d+(?:\.\d+)?)\s*-?\s*(?:feet|foot|ft)\b/i);
  return {
    stories: storyMatch ? numberFrom(storyMatch[1]) : null,
    heightFt: feetMatch ? numberFrom(feetMatch[1]) : null,
  };
}

export function parseArea(text: string): { area: number | null; basis: "per-story" | "total" | "" } {
  const match = text.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?/i);
  if (!match) return { area: null, basis: "" };
  let area = Number(match[1].replace(/,/g, ""));
  if (match[2]) area *= 1000;
  let basis: "per-story" | "total" | "" = "";
  if (/\b(per story|each story|a story|one story|per floor|each floor|a floor)\b/i.test(text)) basis = "per-story";
  else if (/\b(total|whole building|entire building|altogether|all floors|combined|gross building)\b/i.test(text)) basis = "total";
  return { area, basis };
}

export function parseLot(text: string): { lotSqFt: number | null; lotWidthFt: number | null } {
  const acres = text.match(/(\d+(?:\.\d+)?)\s*(?:acres|acre|ac)\b/i);
  const sqft = text.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|square feet|sqft|sf)\b/i);
  const dims = text.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i);
  let lotSqFt: number | null = null;
  if (sqft) lotSqFt = Number(sqft[1].replace(/,/g, ""));
  else if (acres) lotSqFt = Number(acres[1]) * 43560;
  else if (dims) lotSqFt = Number(dims[1]) * Number(dims[2]);
  let lotWidthFt: number | null = null;
  if (dims) lotWidthFt = Number(dims[1]);
  const width = text.match(/(\d+(?:\.\d+)?)\s*(?:feet|foot|ft)\s*wide\b/i);
  if (width) lotWidthFt = Number(width[1]);
  return { lotSqFt, lotWidthFt };
}

export function parseFrontage(text: string): { percent: number | null; widthFt: number | null } {
  const percent = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  const width = text.match(/(\d+(?:\.\d+)?)\s*(?:feet|foot|ft)\b/i);
  return {
    percent: percent ? Number(percent[1]) : null,
    widthFt: width ? Number(width[1]) : null,
  };
}

export function parseScope(text: string): ProjectScope | null {
  if (/change of (occupancy|use)/i.test(text)) return "change-of-occupancy";
  if (/\b(addition|expansion)\b/i.test(text)) return "addition";
  if (/\b(alteration|renovation|tenant improvement|\bti\b|interior)\b/i.test(text)) return "alteration";
  if (/\b(new building|new construction|ground[- ]up|new)\b/i.test(text)) return "new";
  return null;
}

function fail(profile: ProjectProfile, clarification: string): ApplyResult {
  return { ok: false, profile, clarification };
}

function ok(profile: ProjectProfile, acknowledgement: string, skip?: boolean): ApplyResult {
  return skip ? { ok: true, profile, acknowledgement, skip: true } : { ok: true, profile, acknowledgement };
}

export function applyAnswer(profile: ProjectProfile, questionId: QuestionId, raw: string): ApplyResult {
  const text = clean(raw);
  if (!text) return fail(profile, "I need an answer before I can take the next step. What should I put down?");

  switch (questionId) {
    case "identity": {
      if (genericSkip(text)) {
        return ok({ ...profile, name: profile.name || "Untitled project" }, "We'll call it Untitled project until you rename it.", true);
      }
      if (text.length < 2) return fail(profile, "Give me a name or a street address — even a short one.");
      const looksLikeAddress = /^\d+\s+/.test(text) || /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)\b/i.test(text);
      return ok(
        { ...profile, name: text, address: looksLikeAddress ? text : profile.address },
        looksLikeAddress ? `${text} it is. I'll title the report with that address.` : `Noted — ${text}.`,
      );
    }
    case "jurisdiction": {
      if (genericSkip(text)) return ok(profile, "Jurisdiction left open. Zoning items will stay unverified until there's a place to search.", true);
      const parsed = parseJurisdiction(text);
      if (!parsed) return fail(profile, "I didn't catch a place. Try a city and a state, like Seattle, WA.");
      const next = { ...profile, city: parsed.city || profile.city, county: parsed.county || profile.county, state: parsed.state || profile.state };
      if (!next.state) {
        const place = next.city || next.county;
        return fail(next, `Which state is ${place} in?`);
      }
      if (!next.city && !next.county) return fail(next, `Which city or county in ${next.state}?`);
      const place = [next.city, next.county].filter(Boolean).join(", ");
      return ok(next, `${place}, ${next.state}. I'll search that ordinance when the checklist is drafted.`);
    }
    case "occupancy": {
      if (genericSkip(text)) return ok(profile, "Occupancy left open. Height and area tables need a group before they can be read.", true);
      const groups = parseOccupancy(text);
      if (groups.length === 0) {
        return fail(profile, "I need a use group or a plain description — office, restaurant, apartments, retail, or a code like R-2.");
      }
      return ok({ ...profile, occupancy: groups }, `${groups.map((group) => `Group ${group}`).join(" and ")}.`);
    }
    case "construction": {
      if (genericSkip(text)) return ok(profile, "Construction type left open. The tables need a column before the comparison means anything.", true);
      const type = parseConstruction(text);
      if (!type) return fail(profile, "Try a type such as II-A, V-B, or heavy timber.");
      return ok({ ...profile, constructionType: type }, `${CONSTRUCTION_LABELS[type]}.`);
    }
    case "zoning": {
      if (genericSkip(text) || /^(not sure|unknown district)$/i.test(text)) {
        return ok(profile, "No district yet. I'll still list the zoning headings so you can fill them once the map is in hand.", true);
      }
      const district = text.replace(/^(it is |it's |its |zoned |zoning |district )/i, "").replace(/\.$/, "");
      if (district.length > 80) return fail(profile, "Give me the district designation itself, like NC3-75 or R-1.");
      return ok({ ...profile, zoningDistrict: district }, `District ${district}.`);
    }
    case "overlays": {
      if (genericSkip(text) || /^(none|no|no overlays?|nothing)$/i.test(text)) {
        return ok({ ...profile, overlays: [] }, "No overlays.", true);
      }
      const parts = text.split(/,| and /i).map((part) => part.trim()).filter(Boolean);
      const overlays = parts.map((part) => {
        if (/historic|landmark/i.test(part)) return "Historic";
        if (/flood/i.test(part)) return "Flood";
        if (/design/i.test(part)) return "Design review";
        if (/transit|tod/i.test(part)) return "Transit";
        if (/hillside|slope/i.test(part)) return "Hillside";
        if (/airport/i.test(part)) return "Airport";
        if (/coastal|shore/i.test(part)) return "Coastal";
        return part.replace(/\.$/, "");
      });
      const unique = [...new Set(overlays)];
      return ok({ ...profile, overlays: unique }, `Overlays: ${unique.join(", ")}.`);
    }
    case "height": {
      if (genericSkip(text)) return ok(profile, "Height left open. Tables 504.3 and 504.4 will stay unchecked.", true);
      const parsed = parseHeight(text);
      if (parsed.stories == null && parsed.heightFt == null) {
        const lone = text.match(/^\d+(?:\.\d+)?$/);
        if (lone) return fail(profile, `Is ${lone[0]} the story count, or the height in feet?`);
        return fail(profile, "Give me stories, feet, or both — for example, 4 stories and 48 feet.");
      }
      const next = {
        ...profile,
        stories: parsed.stories ?? profile.stories,
        heightFt: parsed.heightFt ?? profile.heightFt,
      };
      const bits = [
        next.stories != null ? `${next.stories} ${next.stories === 1 ? "story" : "stories"}` : "",
        next.heightFt != null ? formatFeet(next.heightFt) : "",
      ].filter(Boolean);
      return ok(next, bits.join(", ") + ".");
    }
    case "area": {
      if (genericSkip(text)) return ok(profile, "Area left open. The story-area check will wait.", true);
      const basisOnly = !/\d/.test(text) && /\b(per story|each story|one floor|a floor|per floor|whole|entire|total)\b/i.test(text);
      if (basisOnly && profile.areaSqFt != null) {
        const basis = /\b(total|whole|entire)\b/i.test(text) ? "total" : "per-story";
        return ok(
          { ...profile, areaBasis: basis },
          `${formatSqFt(profile.areaSqFt)}${basis === "total" ? " for the whole building" : " per story"}.`,
        );
      }
      const parsed = parseArea(text);
      if (parsed.area == null) return fail(profile, "I need a number of square feet, such as 12,000 sf per story.");
      let basis = parsed.basis;
      if (!basis && (profile.stories === 1 || profile.stories == null)) basis = "per-story";
      if (!basis && profile.stories && profile.stories > 1) {
        return fail(
          { ...profile, areaSqFt: parsed.area },
          `Is ${formatSqFt(parsed.area)} one floor, or the whole building?`,
        );
      }
      return ok(
        { ...profile, areaSqFt: parsed.area, areaBasis: basis },
        `${formatSqFt(parsed.area)}${basis === "total" ? " for the whole building" : " per story"}.`,
      );
    }
    case "sprinkler": {
      if (genericSkip(text)) {
        return ok({ ...profile, sprinkler: "unknown" }, "Sprinklers unknown. I'll read the nonsprinklered column and flag it.", true);
      }
      const system = parseSprinkler(text);
      if (system === "partial") {
        return fail(profile, "A partial system doesn't take the sprinkler column. Is it NFPA 13 throughout, 13R, 13D, or none?");
      }
      if (!system) return fail(profile, "NFPA 13, 13R, 13D, or none?");
      const assumed = /\byes\b/i.test(text) && system === "nfpa13" && !/13/.test(text);
      return ok(
        { ...profile, sprinkler: system },
        assumed
          ? "I'll treat that as NFPA 13 throughout. Say 13R or 13D if that's the system."
          : system === "none"
            ? "No sprinklers. The NS columns will govern."
            : system === "nfpa13"
              ? "NFPA 13 throughout."
              : system === "nfpa13r"
                ? "NFPA 13R. That system is capped at four stories and 60 feet."
                : "NFPA 13D.",
      );
    }
    case "lot": {
      if (genericSkip(text)) return ok(profile, "Lot size left open.", true);
      const parsed = parseLot(text);
      if (parsed.lotSqFt == null && /^\d+(?:\.\d+)?$/.test(text)) {
        return fail(profile, `Is ${text} acres or square feet?`);
      }
      if (parsed.lotSqFt == null) return fail(profile, "Give me square feet, acres, or dimensions such as 50 by 120 feet.");
      const width = parsed.lotWidthFt != null ? `, ${formatFeet(parsed.lotWidthFt)} wide` : "";
      return ok(
        { ...profile, lotSqFt: parsed.lotSqFt, lotWidthFt: parsed.lotWidthFt ?? profile.lotWidthFt },
        `${formatSqFt(parsed.lotSqFt)} lot${width}.`,
      );
    }
    case "frontage": {
      if (genericSkip(text)) return ok(profile, "No frontage increase until the yards are known. If stays 0.", true);
      const parsed = parseFrontage(text);
      const next = {
        ...profile,
        frontagePercent: parsed.percent ?? profile.frontagePercent,
        openSpaceFt: parsed.widthFt ?? profile.openSpaceFt,
      };
      if (next.frontagePercent == null) return fail(next, "What percentage of the perimeter is open at least 20 feet?");
      if (next.openSpaceFt == null) return fail(next, "How wide is the narrowest of those yards, in feet?");
      return ok(next, `${formatNumber(next.frontagePercent)}% open, narrowest yard ${formatFeet(next.openSpaceFt)}.`);
    }
    case "scope": {
      if (genericSkip(text)) return ok(profile, "Scope left open. I'll assume you still want the new-building provisions checked.", true);
      const scope = parseScope(text);
      if (!scope) return fail(profile, "New building, addition, alteration, or change of occupancy?");
      const label =
        scope === "new"
          ? "New building."
          : scope === "addition"
            ? "An addition. The existing building code will be on the list."
            : scope === "alteration"
              ? "An alteration. I'll include the existing building code."
              : "A change of occupancy. Height, area, and the existing building code all come along.";
      return ok({ ...profile, scope }, label);
    }
    case "notes": {
      if (genericSkip(text) || /^(none|no|nothing|nope)$/i.test(text)) {
        return ok(profile, "Nothing further. I'll draft the checklist from the file.", true);
      }
      return ok({ ...profile, notes: text }, "I'll keep that with the file and draft the checklist next.");
    }
    default:
      return fail(profile, "That question isn't on the list.");
  }
}

export function questionCount(): number {
  return QUESTIONS.length;
}

export function assertQuestionOrder(): QuestionId[] {
  return QUESTIONS.map((question) => question.id);
}
