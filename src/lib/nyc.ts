import { formatNumber, formatSqFt } from "@/lib/format";
import type { ChecklistItem, NycBorough, NycParcel, ProjectProfile, QuestionId } from "@/lib/types";

export const NYC_BOROUGHS: NycBorough[] = ["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];

const BOROUGH_COUNTY: Record<NycBorough, string> = {
  Manhattan: "New York County",
  Bronx: "Bronx County",
  Brooklyn: "Kings County",
  Queens: "Queens County",
  "Staten Island": "Richmond County",
};

const OUTSIDE_CITY =
  /\b(seattle|austin|boston|chicago|philadelphia|miami|los angeles|san francisco|houston|dallas|atlanta|denver|portland|minneapolis|detroit)\b|\bwashington,?\s*d\.?c\b/i;
const OUTSIDE_STATE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/;

export type GeoHit = {
  label: string;
  borough: string;
  housenumber: string;
  street: string;
  postalcode: string;
  bbl: string;
  bin: string;
};

export type ResolveOk = { status: "ok"; parcel: NycParcel; acknowledgement: string };
export type ResolveAmbiguous = { status: "ambiguous"; prompt: string; choices: { label: string; borough: string; bbl: string }[] };
export type ResolveMiss = { status: "outside" | "not_found"; prompt: string };
export type ResolveResult = ResolveOk | ResolveAmbiguous | ResolveMiss;

export function mentionsOutsideNewYork(text: string): boolean {
  return OUTSIDE_CITY.test(text) || OUTSIDE_STATE.test(text);
}

export function boroughFromText(text: string): NycBorough | null {
  const value = text.toLowerCase();
  if (/\bstaten island\b|\brichmond\b/.test(value)) return "Staten Island";
  if (/\bbrooklyn\b|\bkings\b/.test(value)) return "Brooklyn";
  if (/\bqueens\b/.test(value)) return "Queens";
  if (/\bbronx\b/.test(value)) return "Bronx";
  if (/\bmanhattan\b|\bnew york county\b/.test(value)) return "Manhattan";
  return null;
}

function houseNumber(text: string): string {
  const match = text.trim().match(/^(\d+(?:-\d+)?[a-zA-Z]?)/);
  return match ? match[1].toUpperCase() : "";
}

const STREET_KINDS: [string, string][] = [
  ["street", "st"],
  ["avenue", "ave"],
  ["place", "pl"],
  ["boulevard", "blvd"],
  ["drive", "dr"],
  ["road", "rd"],
  ["lane", "ln"],
  ["court", "ct"],
  ["terrace", "ter"],
];

function streetSignature(text: string): { name: string; kind: string | null } {
  const lower = text.toLowerCase().replace(/centre/g, "center");
  const kind = STREET_KINDS.find(([full, abbr]) => new RegExp(`\\b(${full}|${abbr})\\b`).test(lower))?.[0] ?? null;
  const name = lower
    .replace(/\b(manhattan|brooklyn|queens|bronx|staten island|new york|nyc|ny|usa)\b/g, " ")
    .replace(/\b(street|st|avenue|ave|place|pl|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|terrace|ter)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !/^\d/.test(token))
    .join(" ");
  return { name, kind };
}

export function chooseHits(query: string, hits: GeoHit[]): { kind: "one"; hit: GeoHit } | { kind: "many"; hits: GeoHit[] } | { kind: "none" } {
  const wantedBorough = boroughFromText(query);
  const wantedNumber = houseNumber(query);
  const wantedStreet = streetSignature(query);
  const scored = hits
    .filter((hit) => NYC_BOROUGHS.includes(hit.borough as NycBorough))
    .filter((hit) => hit.bbl)
    .filter((hit) => !wantedBorough || hit.borough === wantedBorough)
    .filter((hit) => !wantedNumber || hit.housenumber.toUpperCase() === wantedNumber)
    .filter((hit) => {
      const street = streetSignature(hit.street);
      if (wantedStreet.kind && street.kind && wantedStreet.kind !== street.kind) return false;
      if (!wantedStreet.name) return true;
      return street.name === wantedStreet.name;
    });

  const unique = new Map<string, GeoHit>();
  for (const hit of scored) {
    if (!unique.has(hit.bbl)) unique.set(hit.bbl, hit);
  }
  const list = [...unique.values()];
  if (list.length === 1) return { kind: "one", hit: list[0] };
  if (list.length > 1) return { kind: "many", hits: list.slice(0, 4) };
  return { kind: "none" };
}

type PlutoValue = string | number | boolean | null | undefined;
type PlutoRow = Record<string, PlutoValue>;

function num(value: PlutoValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: PlutoValue): string {
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "boolean") return value ? "Y" : "";
  return typeof value === "string" ? value.trim() : "";
}

function listFields(row: PlutoRow, keys: string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const key of keys) {
    const value = text(row[key]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function normalizedRow(row: PlutoRow): PlutoRow {
  const out: PlutoRow = {};
  for (const [key, value] of Object.entries(row)) out[key.toLowerCase()] = value;
  return out;
}

function mihFromRow(row: PlutoRow): string[] {
  const values: string[] = [];
  for (const key of ["mihoption1", "mihoption2", "mihoption3", "mihoption4"]) {
    const value = text(row[key]);
    if (!value || /^(n|na|none|0|no)$/i.test(value)) continue;
    values.push(value);
  }
  return values;
}

export function isCondoUnitLot(lot: string, condoNumber: string): boolean {
  const number = Number(lot);
  return condoNumber.trim() !== "" && number >= 1000 && number <= 6999;
}

export function lpcHistoricName(variableId: string, variableType: string): string {
  if (variableType !== "nyc_historic_districts") return "";
  return variableId.replace(/^LP-\d+-/, "").replace(/\s+/g, " ").trim();
}

export type LayerFacts = {
  /** False when the lot had no geometry, so polygon layers were not queried. */
  spatial: boolean;
  zoningDistricts: string[] | null;
  commercialOverlays: string[] | null;
  specialDistricts: { name: string; code: string }[] | null;
  subdistricts: { name: string; label: string }[] | null;
  limitedHeight: string | null;
  eDesignations: { id: string; note: string }[] | null;
  inclusionaryHousing: string[] | null;
  mandatoryInclusionary: string[] | null;
  transitZone: string | null;
  waterfront: string[] | null;
  historicDistrict: string | null;
};

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = clean.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function loose(value: string): string {
  return value.toLowerCase().replace(/[-–—]/g, " ").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function sameSet(left: string[], right: string[]): boolean {
  const a = new Set(left.map((item) => item.toUpperCase()));
  const b = new Set(right.map((item) => item.toUpperCase()));
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function formatSpecial(name: string, code: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  const tag = code.trim();
  if (clean && tag) return `${clean} (${tag})`;
  return clean || tag;
}

function formatSubdistrict(name: string, label: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  const tag = label.replace(/\s+/g, " ").trim();
  if (!clean || /^none$/i.test(clean)) return "";
  if (!tag || /^none$/i.test(tag) || tag.toLowerCase() === clean.toLowerCase()) return clean;
  return `${clean} (${tag})`;
}

export function mergeParcelLayers(base: NycParcel, layers: LayerFacts): NycParcel {
  const gaps = [...base.layerGaps];
  let zoningDistricts = base.zoningDistricts;
  let commercialOverlays = base.commercialOverlays;
  let specialDistricts = base.specialDistricts;
  let subdistricts = base.subdistricts;
  let limitedHeight = base.limitedHeight;
  let historicDistrict = base.historicDistrict;
  let eDesignations = base.eDesignations;
  let inclusionaryHousing = base.inclusionaryHousing;
  let mandatoryInclusionary = base.mandatoryInclusionary;
  let transitZone = base.transitZone;
  let waterfront = base.waterfront;

  if (!layers.spatial) {
    gaps.push("Lot geometry was missing, so the zoning map layers were not intersected. Districts below are from MapPLUTO only.");
  } else {
    if (layers.zoningDistricts) {
      const gis = uniq(layers.zoningDistricts);
      if (!sameSet(base.zoningDistricts, gis)) {
        gaps.push(`Zoning districts differ. MapPLUTO: ${base.zoningDistricts.join(", ") || "none"}. Zoning map: ${gis.join(", ") || "none"}.`);
      }
      zoningDistricts = uniq([...base.zoningDistricts, ...gis]);
    } else {
      gaps.push("The zoning district layer did not answer. Districts are from MapPLUTO only.");
    }

    if (layers.commercialOverlays) {
      const gis = uniq(layers.commercialOverlays);
      if (!sameSet(base.commercialOverlays, gis)) {
        gaps.push(`Commercial overlays differ. MapPLUTO: ${base.commercialOverlays.join(", ") || "none"}. Overlay layer: ${gis.join(", ") || "none"}.`);
      }
      commercialOverlays = uniq([...base.commercialOverlays, ...gis]);
    } else {
      gaps.push("The commercial overlay layer did not answer. Overlays are from MapPLUTO only.");
    }

    if (layers.specialDistricts) {
      const formatted = uniq(layers.specialDistricts.map((item) => formatSpecial(item.name, item.code)));
      const codes = new Set(layers.specialDistricts.map((item) => item.code.trim().toUpperCase()).filter(Boolean));
      const plutoOnly = base.specialDistricts.filter((code) => !codes.has(code.trim().toUpperCase()));
      if (plutoOnly.length) gaps.push(`MapPLUTO special district ${plutoOnly.join(", ")} was not in the special-district layer.`);
      specialDistricts = uniq([...formatted, ...plutoOnly]);
    } else {
      gaps.push("The special district layer did not answer. Special districts are from MapPLUTO only.");
    }

    if (layers.subdistricts) {
      subdistricts = uniq(layers.subdistricts.map((item) => formatSubdistrict(item.name, item.label)));
    } else {
      gaps.push("The special district subdistrict layer did not answer.");
    }

    if (layers.limitedHeight !== null) {
      const gis = layers.limitedHeight.trim();
      if (base.limitedHeight && gis && base.limitedHeight.toUpperCase() !== gis.toUpperCase()) {
        gaps.push(`Limited height differs. MapPLUTO: ${base.limitedHeight}. Limited-height layer: ${gis}.`);
      }
      limitedHeight = gis || base.limitedHeight;
    } else {
      gaps.push("The limited-height layer did not answer.");
    }

    if (layers.transitZone !== null) {
      const gis = layers.transitZone.trim();
      if (base.transitZone && gis && base.transitZone.toLowerCase() !== gis.toLowerCase()) {
        gaps.push(`Transit zone differs. MapPLUTO: ${base.transitZone}. Transit layer: ${gis}.`);
      }
      transitZone = gis || base.transitZone;
    } else {
      gaps.push("The transit-zone layer did not answer. The zone is from MapPLUTO only.");
    }

    if (layers.waterfront) {
      waterfront = uniq(layers.waterfront).join("; ");
    } else {
      gaps.push("The waterfront access plan layer did not answer.");
    }

    if (layers.historicDistrict !== null) {
      const gis = layers.historicDistrict.trim();
      const plutoName = loose(base.historicDistrict);
      const gisName = loose(gis);
      const sameName = Boolean(plutoName && gisName) && (plutoName === gisName || plutoName.includes(gisName) || gisName.includes(plutoName));
      if (base.historicDistrict && gis && !sameName) {
        gaps.push(`Historic district names differ. MapPLUTO: ${base.historicDistrict}. LPC layer: ${gis}.`);
        historicDistrict = base.historicDistrict;
      } else if (base.historicDistrict && !gis) {
        gaps.push(`MapPLUTO lists ${base.historicDistrict}, and the LPC historic-district layer did not cover this lot.`);
      } else {
        historicDistrict = base.historicDistrict || gis;
      }
    } else {
      gaps.push("The historic-district layer did not answer. The name is from MapPLUTO only.");
    }

    if (layers.inclusionaryHousing) {
      inclusionaryHousing = uniq(layers.inclusionaryHousing);
    } else {
      gaps.push("The inclusionary housing layer did not answer.");
    }

    if (layers.mandatoryInclusionary) {
      mandatoryInclusionary = uniq(layers.mandatoryInclusionary.length ? layers.mandatoryInclusionary : base.mandatoryInclusionary);
    } else {
      gaps.push("The mandatory inclusionary housing layer did not answer.");
    }
  }

  if (layers.eDesignations) {
    const notes = new Map<string, string>();
    for (const item of layers.eDesignations) {
      const id = item.id.trim();
      if (id) notes.set(id.toUpperCase(), item.note.trim());
    }
    const ids = uniq([...base.eDesignations.map((item) => item.id), ...layers.eDesignations.map((item) => item.id)]);
    eDesignations = ids.map((id) => ({ id, note: notes.get(id.toUpperCase()) || base.eDesignations.find((item) => item.id.toUpperCase() === id.toUpperCase())?.note || "" }));
    const gisIds = new Set([...notes.keys()]);
    const plutoOnly = base.eDesignations.filter((item) => !gisIds.has(item.id.toUpperCase()));
    if (plutoOnly.length) gaps.push(`MapPLUTO lists ${plutoOnly.map((item) => item.id).join(", ")}, and the E-designation layer did not.`);
  } else {
    gaps.push("The E-designation layer did not answer.");
  }

  return {
    ...base,
    zoningDistricts,
    commercialOverlays,
    specialDistricts,
    subdistricts,
    limitedHeight,
    historicDistrict,
    eDesignations,
    inclusionaryHousing,
    mandatoryInclusionary,
    transitZone,
    waterfront,
    splitZone: base.splitZone || zoningDistricts.length > 1,
    layerGaps: uniq(gaps),
    source: `${base.source} · DCP zoning layers`,
  };
}

const BOROUGH_FROM_CODE: Record<string, NycBorough> = {
  "1": "Manhattan",
  MN: "Manhattan",
  "2": "Bronx",
  BX: "Bronx",
  "3": "Brooklyn",
  BK: "Brooklyn",
  "4": "Queens",
  QN: "Queens",
  "5": "Staten Island",
  SI: "Staten Island",
};

export function parcelFromPluto(row: PlutoRow, hit: GeoHit): NycParcel {
  row = normalizedRow(row);
  const bbl = text(row.bbl).replace(/\..*$/, "").replace(/\.0+$/, "") || hit.bbl;
  const boroughCode = bbl.slice(0, 1);
  const borough = BOROUGH_FROM_CODE[text(row.borough)] || BOROUGH_FROM_CODE[boroughCode] || (hit.borough as NycBorough);
  const block = text(row.block) || String(Number(bbl.slice(1, 6)));
  const lot = text(row.lot) || String(Number(bbl.slice(6)));
  return {
    borough,
    boroughCode,
    block,
    lot,
    bbl,
    bin: hit.bin,
    address: text(row.address) || hit.label,
    zip: text(row.zipcode) || hit.postalcode,
    zoningDistricts: listFields(row, ["zonedist1", "zonedist2", "zonedist3", "zonedist4"]),
    commercialOverlays: listFields(row, ["overlay1", "overlay2"]),
    specialDistricts: listFields(row, ["spdist1", "spdist2", "spdist3"]),
    limitedHeight: text(row.ltdheight),
    historicDistrict: text(row.histdist),
    landmark: text(row.landmark),
    splitZone: text(row.splitzone).toUpperCase() === "Y" || row.splitzone === true,
    subdistricts: [],
    eDesignations: text(row.edesignum) ? [{ id: text(row.edesignum), note: "" }] : [],
    inclusionaryHousing: [],
    mandatoryInclusionary: mihFromRow(row),
    transitZone: text(row.trnstzone),
    waterfront: "",
    certificateOfOccupancy: null,
    condoNumber: text(row.condono),
    billingLot: Number(lot) >= 7501 && Number(lot) <= 7599,
    unitBbl: "",
    layerGaps: [],
    lotArea: num(row.lotarea),
    lotFront: num(row.lotfront),
    lotDepth: num(row.lotdepth),
    builtFar: num(row.builtfar),
    residFar: num(row.residfar),
    commFar: num(row.commfar),
    facilFar: num(row.facilfar),
    buildingClass: text(row.bldgclass),
    yearBuilt: text(row.yearbuilt),
    existingFloors: num(row.numfloors),
    existingArea: num(row.bldgarea),
    landUse: text(row.landuse),
    zolaUrl: `https://zola.planning.nyc.gov/lot/${boroughCode}/${Number(block)}/${Number(lot)}`,
    source: `MapPLUTO ${text(row.version) || "NYC Open Data"} · dataset 64uk-42ks`,
  };
}

export function applyParcel(profile: ProjectProfile, parcel: NycParcel): ProjectProfile {
  const place = `${parcel.address}, ${parcel.borough}`;
  const overlays = [
    ...parcel.commercialOverlays,
    ...parcel.specialDistricts,
    ...parcel.subdistricts,
    parcel.limitedHeight ? `Limited height ${parcel.limitedHeight}` : "",
    parcel.historicDistrict,
    parcel.landmark,
    ...parcel.eDesignations.map((item) => (item.note ? `${item.id} (${item.note})` : item.id)),
    ...parcel.inclusionaryHousing,
    ...parcel.mandatoryInclusionary,
    parcel.transitZone,
    parcel.waterfront,
    parcel.condoNumber ? `Condo ${parcel.condoNumber}` : "",
  ].filter(Boolean);
  return {
    ...profile,
    name: place,
    address: place,
    city: "New York",
    county: BOROUGH_COUNTY[parcel.borough],
    state: "New York",
    parcel,
    zoningDistrict: parcel.zoningDistricts.join(" / "),
    overlays,
    lotSqFt: parcel.lotArea,
    lotWidthFt: parcel.lotFront,
  };
}

export const PARCEL_SKIPS: QuestionId[] = ["jurisdiction", "zoning", "overlays", "lot", "frontage"];

export function describeParcel(parcel: NycParcel): string {
  const zoning = parcel.zoningDistricts.join(", ") || "no zoning district in the extract";
  const extra = [
    parcel.splitZone ? "split lot" : "",
    parcel.commercialOverlays.length ? `overlay ${parcel.commercialOverlays.join(", ")}` : "",
    parcel.specialDistricts.length ? parcel.specialDistricts.join(", ") : "",
    parcel.subdistricts.length ? parcel.subdistricts.join(", ") : "",
    parcel.limitedHeight ? `limited height ${parcel.limitedHeight}` : "",
    parcel.eDesignations.length ? parcel.eDesignations.map((item) => item.id).join(", ") : "",
    parcel.historicDistrict,
    parcel.landmark,
    parcel.transitZone,
    parcel.waterfront ? `waterfront ${parcel.waterfront}` : "",
    parcel.billingLot ? `condo billing lot${parcel.condoNumber ? ` ${parcel.condoNumber}` : ""}` : "",
  ].filter(Boolean);
  const lot = parcel.lotArea != null ? `${formatSqFt(parcel.lotArea)} lot` : "lot area not listed";
  const front = parcel.lotFront != null ? `${formatNumber(parcel.lotFront)} ft front` : "";
  const co = parcel.certificateOfOccupancy
    ? ` Latest BIS certificate record is ${parcel.certificateOfOccupancy.provisional ? "temporary" : parcel.certificateOfOccupancy.issueType || "on file"}, issued ${parcel.certificateOfOccupancy.date}.`
    : "";
  const gap = parcel.layerGaps.length ? " A few map layers need another look; they're listed on the sheet." : "";
  return `${parcel.address}, ${parcel.borough}. Block ${parcel.block}, lot ${parcel.lot}, BBL ${parcel.bbl}. Zoning on the lot is ${zoning}${extra.length ? ` (${extra.join("; ")})` : ""}. ${lot}${front ? `, ${front}` : ""}.${co}${gap} I'll only ask what the city file doesn't already say.`;
}

export function zrArticle(district: string): { label: string; url: string } | null {
  if (/^R/i.test(district)) return { label: `ZR residence districts (${district})`, url: "https://zr.planning.nyc.gov/article-ii" };
  if (/^C/i.test(district)) return { label: `ZR commercial districts (${district})`, url: "https://zr.planning.nyc.gov/article-iii" };
  if (/^M/i.test(district)) return { label: `ZR manufacturing districts (${district})`, url: "https://zr.planning.nyc.gov/article-iv" };
  return null;
}

const NYC_BC = "https://www.nyc.gov/site/buildings/codes/nyc-construction-codes.page";
const DOB = "https://www.nyc.gov/site/buildings/index.page";
const LPC = "https://www.nyc.gov/site/lpc/index.page";
const FDNY = "https://www.nyc.gov/site/fdny/index.page";
const ZR_HOME = "https://zr.planning.nyc.gov/";

function nycItem(draft: Omit<ChecklistItem, "applies" | "notes"> & { applies?: boolean }): ChecklistItem {
  return { applies: true, notes: "", ...draft };
}

function certificateSummary(parcel: NycParcel): string {
  const building = `Building class ${parcel.buildingClass || "not listed"}, year built ${parcel.yearBuilt || "not listed"}.`;
  const co = parcel.certificateOfOccupancy;
  if (!co) return `${building} DOB BIS did not return a certificate of occupancy for this BIN.`;
  const kind = co.provisional ? "temporary" : co.issueType || "on file";
  const final = co.latestFinalDate ? ` A final record on file is dated ${co.latestFinalDate}.` : "";
  return `${building} Latest BIS certificate record is ${kind} ${co.jobType}, issued ${co.date}.${final}`;
}

export function contextualizeChecklist(profile: ProjectProfile, items: ChecklistItem[]): ChecklistItem[] {
  const parcel = profile.parcel;
  if (!parcel) return items;
  const building = items
    .filter((item) => item.domain === "building")
    .map((item) => ({
      ...item,
      citation: "unverified" as const,
      status: item.status === "info" ? "info" as const : "review" as const,
      summary: `${item.summary} The 2022 NYC Building Code governs this parcel. Any model IBC number below is a cross-check only and is unverified against the NYC amendments.`,
      sources: [{ label: "2022 NYC Construction Codes", url: NYC_BC }, ...item.sources],
    }));
  const zr = parcel.zoningDistricts.map(zrArticle).filter((link): link is { label: string; url: string } => Boolean(link));
  const plutoSource = { label: parcel.source, url: "https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks" };
  const zola = { label: "ZoLa", url: parcel.zolaUrl };
  const zoningItems: ChecklistItem[] = [
    nycItem({
      id: "nyc-district",
      domain: "zoning",
      section: "MapPLUTO · zoning district",
      title: "Zoning district",
      summary: `${parcel.borough} parcel ${parcel.bbl} is mapped ${parcel.zoningDistricts.join(", ") || "without a district in this extract"}${parcel.splitZone ? " (split lot)" : ""}.`,
      requirements: [
        parcel.zoningDistricts.length
          ? `${parcel.splitZone ? "Split lot. " : ""}Districts on the lot: ${parcel.zoningDistricts.join(", ")}. MapPLUTO and the zoning-district layer are both snapshots. Confirm on ZoLa.`
          : "Neither MapPLUTO nor the zoning-district layer listed a district. Read the district on ZoLa.",
        "City of Yes amendments changed use, parking, and parts of the bulk rules. Read the current Zoning Resolution text, not a pre-amendment summary.",
      ],
      exceptions: ["A split lot can carry more than one district. Each portion is governed by the district that covers it."],
      status: "info",
      citation: "verified",
      sources: [plutoSource, zola, ...zr],
    }),
    nycItem({
      id: "nyc-use",
      domain: "zoning",
      section: "ZR use",
      title: "Use",
      summary: "Whether the proposal is allowed in this district is a Zoning Resolution question. This desk has not read the use table.",
      requirements: [
        `Read the current use regulations for ${parcel.zoningDistricts.join(", ") || "the district"} on zr.planning.nyc.gov.`,
        "City of Yes replaced much of the old use-group structure. Do not rely on a pre-2024 use-group chart.",
      ],
      exceptions: ["Noncomplying uses can sometimes continue under the ZR noncomplying-use rules. That is a reading of the text, not a PLUTO field."],
      status: "review",
      citation: "unverified",
      sources: [{ label: "Zoning Resolution", url: ZR_HOME }, ...zr],
    }),
    nycItem({
      id: "nyc-far",
      domain: "zoning",
      section: "MapPLUTO · FAR",
      title: "Floor area",
      summary: "PLUTO publishes built FAR and the district FAR factors it had on file. They are not a bulk calculation.",
      requirements: [
        parcel.builtFar != null ? `Built FAR in MapPLUTO: ${parcel.builtFar}.` : "Built FAR was not in the extract.",
        `Residential FAR ${parcel.residFar ?? "—"}, commercial FAR ${parcel.commFar ?? "—"}, community-facility FAR ${parcel.facilFar ?? "—"}.`,
        "Compare the proposal with the FAR, height, and setback rules in the district chapter. Quality Housing, tower rules, and City of Yes bulk changes are in the resolution, not in these three numbers.",
      ],
      exceptions: ["Affordable and mandatory-inclusionary floor area can differ from the base residential factor. PLUTO's extra FAR fields are still a snapshot."],
      status: "review",
      citation: "verified",
      sources: [plutoSource, zola, ...zr],
    }),
    nycItem({
      id: "nyc-yards",
      domain: "zoning",
      section: "ZR height and yards",
      title: "Height, setback, and yards",
      summary: parcel.limitedHeight
        ? `MapPLUTO lists limited height district ${parcel.limitedHeight}. The height and yard rules themselves were not read from the resolution.`
        : "Height, setback, and yards have to be read from the district chapter.",
      requirements: [
        parcel.limitedHeight
          ? `Limited height district ${parcel.limitedHeight} is on the PLUTO record. Read that district's height cap in the Zoning Resolution.`
          : "No limited height district was listed. The base district still has height and setback rules.",
        parcel.lotFront != null && parcel.lotDepth != null
          ? `Lot frontage ${parcel.lotFront} ft, depth ${parcel.lotDepth} ft, from MapPLUTO.`
          : "Lot frontage or depth was missing from the extract.",
      ],
      exceptions: ["Street-wall, sky-exposure-plane, and tower-on-a-base rules are exceptions to a simple height number. They depend on the street width and the district."],
      status: "review",
      citation: parcel.limitedHeight ? "verified" : "unverified",
      sources: [plutoSource, { label: "Zoning Resolution", url: ZR_HOME }, ...zr],
    }),
    nycItem({
      id: "nyc-parking",
      domain: "zoning",
      section: "ZR parking",
      title: "Parking",
      summary: parcel.transitZone
        ? `This lot is in ${parcel.transitZone}. Parking minimums and maximums were rewritten by City of Yes. The parking chapter was not read.`
        : "Parking minimums and maximums in New York City were rewritten by City of Yes. Nothing here was read from the parking chapter.",
      requirements: [
        parcel.transitZone
          ? `Transit or special parking area from the zoning layers: ${parcel.transitZone}.`
          : "No transit zone or special parking area was returned for this lot.",
        "Read the current parking section for this district and this use. The zone name is not the parking rule.",
      ],
      exceptions: ["Existing buildings and small enlargements often keep a different parking obligation than a new building."],
      status: "review",
      citation: "unverified",
      sources: [{ label: "Zoning Resolution", url: ZR_HOME }],
    }),
    nycItem({
      id: "nyc-overlay",
      domain: "zoning",
      section: "ZR overlays and special districts",
      title: "Overlays and special districts",
      summary: parcel.commercialOverlays.length || parcel.specialDistricts.length || parcel.subdistricts.length
        ? `On this lot: ${[...parcel.commercialOverlays, ...parcel.specialDistricts, ...parcel.subdistricts].join(", ")}.`
        : "No commercial overlay, special district, or subdistrict was returned for this lot.",
      requirements: parcel.commercialOverlays.length || parcel.specialDistricts.length || parcel.subdistricts.length
        ? [`Read the overlay, special district, and subdistrict text for ${[...parcel.commercialOverlays, ...parcel.specialDistricts, ...parcel.subdistricts].join(", ")}. A special district can replace the base bulk rules. The official name comes from the special-district layer when that layer answered.`]
        : ["The overlay and special-district layers did not return a hit. Confirm on ZoLa before treating the lot as having none."],
      exceptions: ["Some special districts only change use or signage and leave the base height rules in place."],
      status: "review",
      citation: parcel.commercialOverlays.length || parcel.specialDistricts.length || parcel.subdistricts.length ? "verified" : "unverified",
      sources: [plutoSource, zola, { label: "Zoning Resolution", url: ZR_HOME }, ...parcel.specialDistricts.map((name) => ({ label: name, url: ZR_HOME }))],
    }),
    nycItem({
      id: "nyc-edesign",
      domain: "zoning",
      section: "E-designation",
      title: "E-designations",
      summary: parcel.eDesignations.length
        ? parcel.eDesignations.map((item) => (item.note ? `${item.id}: ${item.note}` : item.id)).join(". ") + "."
        : "No E-designation was returned for this tax lot.",
      requirements: parcel.eDesignations.length
        ? ["An E-designation is an environmental requirement tied to the lot. Read the description and the related CEQR or ULURP record before filing. The designation id is from city data; the satisfaction of it is not."]
        : ["A blank result is not a certification that no E-designation exists. Confirm on ZoLa if the layer did not answer."],
      exceptions: ["Some E-designations are satisfied by a notice from the Department of Environmental Protection before a building permit, not by a zoning waiver."],
      applies: parcel.eDesignations.length > 0,
      status: "review",
      citation: parcel.eDesignations.length ? "verified" : "unverified",
      sources: [plutoSource, zola],
    }),
    nycItem({
      id: "nyc-inclusionary",
      domain: "zoning",
      section: "Inclusionary housing",
      title: "Inclusionary housing",
      summary: parcel.mandatoryInclusionary.length || parcel.inclusionaryHousing.length
        ? `Mapped areas: ${[...parcel.mandatoryInclusionary, ...parcel.inclusionaryHousing].join("; ")}.`
        : "No mandatory inclusionary housing area or inclusionary housing designated area was returned for this lot.",
      requirements: parcel.mandatoryInclusionary.length || parcel.inclusionaryHousing.length
        ? ["Read the option and the zoning text for this area. The map name is not the floor-area calculation."]
        : ["Confirm on ZoLa. These layers can miss a recent adoption."],
      exceptions: ["Voluntary inclusionary housing can apply in some districts without a designated-area polygon."],
      applies: parcel.mandatoryInclusionary.length + parcel.inclusionaryHousing.length > 0,
      status: "review",
      citation: parcel.mandatoryInclusionary.length || parcel.inclusionaryHousing.length ? "verified" : "unverified",
      sources: [zola, { label: "Zoning Resolution", url: ZR_HOME }],
    }),
    nycItem({
      id: "nyc-waterfront",
      domain: "zoning",
      section: "Waterfront",
      title: "Waterfront access",
      summary: parcel.waterfront
        ? `Waterfront access plan: ${parcel.waterfront}.`
        : "No waterfront access plan polygon covers this lot.",
      requirements: parcel.waterfront
        ? [`Read the waterfront zoning rules and the ${parcel.waterfront} access plan. The plan name is from the waterfront layer; the public-access dimensions were not read.`]
        : ["Lots outside a waterfront access plan can still be waterfront lots under the Zoning Resolution. Check the waterfront zoning map if the site touches the shoreline."],
      exceptions: ["Upland lots inside a waterfront access plan are not always required to build a shore public walkway."],
      applies: Boolean(parcel.waterfront),
      status: "review",
      citation: parcel.waterfront ? "verified" : "unverified",
      sources: [zola, { label: "Zoning Resolution", url: ZR_HOME }],
    }),
    nycItem({
      id: "nyc-fresh",
      domain: "zoning",
      section: "FRESH",
      title: "FRESH food stores",
      summary: "FRESH zoning boundaries are not published as a polygon layer on the map service this desk queries. Nothing here is a FRESH determination.",
      requirements: ["If the proposal is a grocery store seeking FRESH floor area, confirm the FRESH area on ZoLa and in the Zoning Resolution."],
      exceptions: ["A FRESH food store certification is a separate action from the base district."],
      applies: false,
      status: "info",
      citation: "unverified",
      sources: [zola, { label: "Zoning Resolution", url: ZR_HOME }],
    }),
    ...(parcel.layerGaps.length
      ? [nycItem({
          id: "nyc-gaps",
          domain: "zoning",
          section: "Data notes",
          title: "Layer notes",
          summary: "MapPLUTO and the zoning layers did not agree, or a layer did not answer.",
          requirements: parcel.layerGaps,
          exceptions: ["A missing layer is a data gap, not a finding that the district is absent."],
          status: "info",
          citation: "verified",
          sources: [zola, plutoSource],
        })]
      : []),
    nycItem({
      id: "nyc-lpc",
      domain: "zoning",
      section: "Landmarks Preservation Commission",
      title: "Landmarks",
      summary: parcel.landmark || parcel.historicDistrict
        ? `City records flag ${[parcel.landmark, parcel.historicDistrict].filter(Boolean).join("; ")}.`
        : "MapPLUTO and the LPC historic-district layer did not flag an individual landmark or a historic district.",
      requirements: parcel.landmark || parcel.historicDistrict
        ? ["Work on a landmark or in a historic district needs Landmarks review before, or with, the building permit. Confirm the designation with LPC; PLUTO is not the designation report."]
        : ["Still check LPC maps. A blank PLUTO landmark field does not prove the building is undesignated."],
      exceptions: ["Some ordinary repairs are staff-level or do not need a certificate. That is an LPC rule, not a PLUTO field."],
      applies: Boolean(parcel.landmark || parcel.historicDistrict),
      status: "review",
      citation: parcel.landmark || parcel.historicDistrict ? "verified" : "unverified",
      sources: [plutoSource, { label: "Landmarks Preservation Commission", url: LPC }],
    }),
    nycItem({
      id: "nyc-dob",
      domain: "building",
      section: "NYC Department of Buildings",
      title: "DOB filing",
      summary: certificateSummary(parcel),
      requirements: [
        "New buildings, alterations, and changes of occupancy are filed with the Department of Buildings. The job type depends on the scope you still have to name.",
        parcel.buildingClass ? `MapPLUTO building class is ${parcel.buildingClass}. Confirm the DOB description; the class is not an occupancy group.` : "Building class was blank in the extract.",
        parcel.certificateOfOccupancy?.provisional
          ? "The latest BIS record is temporary. Do not treat it as the governing final certificate of occupancy."
          : "BIS is a record search, not a determination of the legal occupancy.",
      ],
      exceptions: ["Limited alterations can be filed as a smaller job type. The threshold is in the DOB rules, not in PLUTO."],
      status: "review",
      citation: parcel.certificateOfOccupancy ? "verified" : "unverified",
      sources: [
        { label: "NYC Department of Buildings", url: DOB },
        { label: "DOB BIS certificates of occupancy", url: "https://data.cityofnewyork.us/Housing-Development/DOB-Certificate-Of-Occupancy/bs8b-p36w" },
        plutoSource,
      ],
    }),
    nycItem({
      id: "nyc-fdny",
      domain: "building",
      section: "FDNY",
      title: "Fire Department",
      summary: "Sprinkler, alarm, and place-of-assembly approvals can sit with FDNY as well as DOB. Nothing here was read from an FDNY bulletin.",
      requirements: ["If the proposal is a public assembly, a commercial cooking space, or a change in fire protection, confirm whether FDNY sign-off is required in addition to the building permit."],
      exceptions: ["Ordinary residential alterations often stay with DOB only. That depends on the scope."],
      status: "info",
      citation: "unverified",
      sources: [{ label: "FDNY", url: FDNY }],
    }),
  ];
  return [...building, ...zoningItems];
}
