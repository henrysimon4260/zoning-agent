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

export type ProjectProfile = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  state: string;
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
  "Lintel is a research aid for architects and developers. It is not a code determination, a zoning opinion, or a permit. Building-code figures are the unamended 2021 International Building Code model and can differ from the edition and local amendments your jurisdiction adopted. A zoning statement is verified only when it was read on a linked ordinance page; everything else is labeled unverified. Confirm the adopted code with the authority having jurisdiction.";

export const MODEL_CODE_LABEL = "2021 IBC model code";

export const ICC_CODE_URL = "https://codes.iccsafe.org/content/IBC2021P1";
