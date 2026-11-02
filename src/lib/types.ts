export const CONSTRUCTION_TYPES = [
  "IA",
  "IB",
  "IIA",
  "IIB",
  "IIIA",
  "IIIB",
  "IVA",
  "IVB",
  "IVC",
  "IVHT",
  "VA",
  "VB",
] as const;

export type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];

export type Sprinkler = "none" | "nfpa13" | "nfpa13r" | "nfpa13d" | "unknown";

export type CodeEdition = "2018" | "2021" | "2024" | "unknown";

export type ProjectScope = "new" | "addition" | "alteration" | "change-of-occupancy" | "unknown";

export type AreaBasis = "per-story" | "total" | "";

export type NycBorough = "Manhattan" | "Bronx" | "Brooklyn" | "Queens" | "Staten Island";

export type NycParcel = {
  borough: NycBorough;
  boroughCode: string;
  block: string;
  lot: string;
  bbl: string;
  bin: string;
  address: string;
  zip: string;
  zoningDistricts: string[];
  commercialOverlays: string[];
  specialDistricts: string[];
  limitedHeight: string;
  historicDistrict: string;
  landmark: string;
  splitZone: boolean;
  subdistricts: string[];
  eDesignations: { id: string; note: string }[];
  inclusionaryHousing: string[];
  mandatoryInclusionary: string[];
  transitZone: string;
  waterfront: string;
  certificateOfOccupancy: {
    date: string;
    jobType: string;
    issueType: string;
    provisional: boolean;
    latestFinalDate: string;
  } | null;
  condoNumber: string;
  billingLot: boolean;
  unitBbl: string;
  layerGaps: string[];
  lotArea: number | null;
  lotFront: number | null;
  lotDepth: number | null;
  builtFar: number | null;
  residFar: number | null;
  commFar: number | null;
  facilFar: number | null;
  buildingClass: string;
  yearBuilt: string;
  existingFloors: number | null;
  existingArea: number | null;
  landUse: string;
  zolaUrl: string;
  source: string;
};

export type ProjectProfile = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  state: string;
  parcel: NycParcel | null;
  occupancy: string[];
  constructionType: ConstructionType | "";
  zoningDistrict: string;
  overlays: string[];
  stories: number | null;
  heightFt: number | null;
  areaSqFt: number | null;
  areaBasis: AreaBasis;
  sprinkler: Sprinkler | "";
  lotSqFt: number | null;
  lotWidthFt: number | null;
  frontagePercent: number | null;
  openSpaceFt: number | null;
  scope: ProjectScope | "";
  codeEdition: CodeEdition;
  notes: string;
};

export type Citation = "model-code" | "verified" | "unverified";

export type CheckStatus = "within" | "exceeds" | "review" | "info";

export type ChecklistItem = {
  id: string;
  domain: "building" | "zoning";
  section: string;
  title: string;
  summary: string;
  requirements: string[];
  exceptions: string[];
  applies: boolean;
  notes: string;
  status: CheckStatus;
  citation: Citation;
  sources: { label: string; url: string }[];
};

export type ChatAttachment = {
  kind: "report";
  title: string;
  filename: string;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachment?: ChatAttachment;
};

export type QuestionId =
  | "identity"
  | "jurisdiction"
  | "occupancy"
  | "construction"
  | "zoning"
  | "overlays"
  | "height"
  | "area"
  | "sprinkler"
  | "lot"
  | "frontage"
  | "scope"
  | "notes";

export type ProjectRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  profile: ProjectProfile;
  checklist: ChecklistItem[];
  messages: ChatMessage[];
  skipped: QuestionId[];
  analyzedHash: string;
  syncedAt?: string;
};

export type ZoningTopic = {
  requirements: string[];
  exceptions: string[];
  verified: boolean;
};

export type ZoningFindings = {
  codeTitle?: string;
  sources: { label: string; url: string }[];
  use?: ZoningTopic;
  setbacks?: ZoningTopic;
  height?: ZoningTopic;
  far?: ZoningTopic;
  coverage?: ZoningTopic;
  parking?: ZoningTopic;
  overlay?: ZoningTopic;
};

export const DISCLAIMER =
  "Lintel is a research aid for New York City projects. It is not a Department of Buildings determination, a zoning opinion, a Landmarks approval, or a permit. Parcel facts are read from NYC Planning Labs GeoSearch, MapPLUTO, and NYC Planning zoning layers. A certificate of occupancy, when shown, is the latest DOB BIS record and may be temporary. Zoning Resolution and 2022 NYC Building Code requirements are labeled unverified unless the text was read from the linked section. MapPLUTO is a planning snapshot, not the Zoning Map. Confirm with ZoLa, the Zoning Resolution, and the Department of Buildings.";

export const MODEL_CODE_LABEL = "2022 NYC Building Code";

export const ICC_CODE_URL = "https://codes.iccsafe.org/content/IBC2021P1";
