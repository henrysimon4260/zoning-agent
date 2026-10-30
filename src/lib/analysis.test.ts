import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/lib/checklist";
import { frontageFactor } from "@/lib/ibc-tables";
import {
  applyAnswer,
  nextQuestion,
  parseConstruction,
  parseOccupancy,
  parseSprinkler,
  QUESTIONS,
} from "@/lib/interview";
import { assessHeightAndArea, evaluateOccupancy } from "@/lib/limits";
import { renderReportPdf } from "@/lib/pdf";
import { buildReport } from "@/lib/report";
import { pineStreetProject, replayInterview } from "@/lib/sample";
import { sanitizeTopic } from "@/lib/sources";
import { mergeProjects } from "@/lib/storage";
import { summarizeAnalysis } from "@/lib/summary";
import type { ProjectProfile, ProjectRecord } from "@/lib/types";

function blank(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    id: "test",
    name: "Test",
    address: "",
    city: "",
    county: "",
    state: "",
    occupancy: [],
    constructionType: "",
    zoningDistrict: "",
    overlays: [],
    stories: null,
    heightFt: null,
    areaSqFt: null,
    areaBasis: "",
    sprinkler: "",
    lotSqFt: null,
    lotWidthFt: null,
    frontagePercent: null,
    openSpaceFt: null,
    scope: "",
    codeEdition: "2021",
    notes: "",
    ...overrides,
  };
}

describe("frontage and allowable area", () => {
  it("reads Table 506.3.3", () => {
    expect(frontageFactor(null, null)).toBe(0);
    expect(frontageFactor(10, 40)).toBe(0);
    expect(frontageFactor(40, 22)).toBe(0.17);
    expect(frontageFactor(50, 40)).toBe(0.5);
    expect(frontageFactor(80, 22)).toBe(0.5);
    expect(frontageFactor(80, 27)).toBe(0.63);
    expect(frontageFactor(100, 30)).toBe(0.75);
  });

  it("matches the ICC worked examples for Group B, Type V-A, NFPA 13", () => {
    const base = blank({
      occupancy: ["B"],
      constructionType: "VA",
      sprinkler: "nfpa13",
      frontagePercent: 50,
      openSpaceFt: 40,
      areaBasis: "per-story",
    });
    const one = evaluateOccupancy({ ...base, stories: 1 }, "B");
    const two = evaluateOccupancy({ ...base, stories: 2 }, "B");
    const four = evaluateOccupancy({ ...base, stories: 4 }, "B");
    expect(one?.perStory).toBe(81000);
    expect(one?.total).toBe(81000);
    expect(two?.perStory).toBe(63000);
    expect(two?.total).toBe(126000);
    expect(four?.perStory).toBe(63000);
    expect(four?.total).toBe(189000);
  });

  it("matches the ICC NFPA 13R example for Group R-2, Type V-A", () => {
    const limit = evaluateOccupancy(
      blank({
        occupancy: ["R-2"],
        constructionType: "VA",
        sprinkler: "nfpa13r",
        stories: 4,
        frontagePercent: 50,
        openSpaceFt: 40,
      }),
      "R-2",
    );
    expect(limit?.perStory).toBe(18000);
    expect(limit?.total).toBe(72000);
    expect(limit?.stories).toBe(4);
    expect(limit?.feet).toBe(60);
  });
});

describe("interview", () => {
  it("asks exactly one question at a time, in order", () => {
    for (const question of QUESTIONS) {
      expect(question.prompt.match(/\?/g)?.length).toBe(1);
    }
    let profile = blank({ name: "", id: "q" });
    const seen: string[] = [];
    const skipped: string[] = [];
    for (let step = 0; step < QUESTIONS.length; step += 1) {
      const question = nextQuestion(profile, skipped as never[]);
      expect(question?.id).toBe(QUESTIONS[step].id);
      seen.push(question!.id);
      const result = applyAnswer(profile, question!.id, "skip");
      expect(result.ok).toBe(true);
      if (result.ok) {
        profile = result.profile;
        if (result.skip) skipped.push(question!.id);
      }
    }
    expect(nextQuestion(profile, skipped as never[])).toBeNull();
    expect(seen).toEqual(QUESTIONS.map((question) => question.id));
  });

  it("parses occupancy, construction, and sprinklers", () => {
    expect(parseOccupancy("R-2 apartments over M retail")).toEqual(["R-2", "M"]);
    expect(parseOccupancy("a restaurant")).toEqual(["A-2"]);
    expect(parseConstruction("type 5B")).toBe("VB");
    expect(parseConstruction("V-B")).toBe("VB");
    expect(parseConstruction("IIIA")).toBe("IIIA");
    expect(parseConstruction("Type I-A")).toBe("IA");
    expect(parseSprinkler("NFPA 13R")).toBe("nfpa13r");
    expect(parseSprinkler("none")).toBe("none");
    expect(parseSprinkler("yes")).toBe("nfpa13");
  });

  it("keeps a partial jurisdiction and asks for the missing half", () => {
    const cityOnly = applyAnswer(blank(), "jurisdiction", "Seattle");
    expect(cityOnly.ok).toBe(false);
    if (!cityOnly.ok) {
      expect(cityOnly.clarification).toMatch(/which state/i);
      expect(cityOnly.profile.city).toBe("Seattle");
    }
    const done = applyAnswer(cityOnly.profile, "jurisdiction", "Washington");
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.profile).toMatchObject({ city: "Seattle", state: "Washington" });
  });

  it("walks the Pine Street answers into one profile", () => {
    const played = replayInterview({
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
    });
    expect(played.pending?.ok).toBe(true);
    expect(played.profile).toMatchObject({
      address: "412 East Pine Street",
      city: "Seattle",
      state: "Washington",
      occupancy: ["R-2", "M"],
      constructionType: "VA",
      zoningDistrict: "NC3-75",
      stories: 6,
      heightFt: 68,
      areaSqFt: 12000,
      areaBasis: "per-story",
      sprinkler: "nfpa13",
      lotSqFt: 15000,
      lotWidthFt: 120,
      frontagePercent: 50,
      openSpaceFt: 40,
      scope: "new",
    });
    expect(nextQuestion(played.profile, played.skipped)).toBeNull();
  });
});

describe("checklist and report", () => {
  it("flags the Pine Street stories and leaves zoning unverified", () => {
    const project = pineStreetProject();
    const stories = project.checklist.find((item) => item.id === "ibc-stories");
    const height = project.checklist.find((item) => item.id === "ibc-height");
    const area = project.checklist.find((item) => item.id === "ibc-area");
    const use = project.checklist.find((item) => item.id === "zoning-use");
    expect(stories?.status).toBe("exceeds");
    expect(height?.status).toBe("within");
    expect(area?.status).toBe("within");
    expect(use?.citation).toBe("unverified");
    expect(use?.sources.some((source) => source.url.includes("municode"))).toBe(true);
    expect(project.checklist.find((item) => item.id === "ibc-separation")?.applies).toBe(true);
    const summary = summarizeAnalysis(project.profile, project.checklist);
    expect(summary).toMatch(/412 East Pine Street/);
    expect(summary).toMatch(/over the limit/i);
    const report = buildReport(project.profile, project.checklist, "2026-10-30T00:00:00.000Z");
    expect(report.title).toBe("412 East Pine Street");
    expect(report.filename).toBe("412-east-pine-street-code-analysis.pdf");
    expect(report.disclaimer).toMatch(/not a code determination/i);
  });

  it("does not call a 2018 file compliant against 2021 numbers", () => {
    const profile = blank({
      occupancy: ["R-2"],
      constructionType: "VA",
      sprinkler: "nfpa13",
      stories: 6,
      heightFt: 68,
      codeEdition: "2018",
    });
    const assessment = assessHeightAndArea(profile);
    expect(assessment.authoritative).toBe(false);
    const items = buildChecklist(profile, null);
    expect(items.find((item) => item.id === "ibc-stories")?.status).toBe("review");
  });

  it("marks a zoning topic verified only when the figure is in the excerpt", () => {
    const grounded = sanitizeTopic(
      { requirements: ["The front setback is 15 feet."], exceptions: [], verified: true },
      "Minimum front setback: 15 feet.",
    );
    const invented = sanitizeTopic(
      { requirements: ["The front setback is 15 feet."], exceptions: [], verified: true },
      "See the zoning map for standards.",
    );
    expect(grounded?.verified).toBe(true);
    expect(invented?.verified).toBe(false);
    const profile = blank({
      city: "Seattle",
      state: "Washington",
      zoningDistrict: "NC3-75",
      occupancy: ["B"],
      constructionType: "IIA",
    });
    const items = buildChecklist(profile, {
      sources: [{ label: "Municode", url: "https://library.municode.com/example" }],
      use: grounded,
    });
    expect(items.find((item) => item.id === "zoning-use")?.citation).toBe("verified");
  });

  it("builds a PDF", async () => {
    const project = pineStreetProject();
    const bytes = await renderReportPdf(project.profile, project.checklist, "2026-10-30T00:00:00.000Z");
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(2000);
  });
});

describe("saved projects", () => {
  it("keeps the newer copy when local and account drafts merge", () => {
    const older = { id: "1", updatedAt: "2026-01-01T00:00:00.000Z" } as ProjectRecord;
    const newer = { id: "1", updatedAt: "2026-02-01T00:00:00.000Z" } as ProjectRecord;
    const other = { id: "2", updatedAt: "2026-01-15T00:00:00.000Z" } as ProjectRecord;
    expect(mergeProjects([older, other], [newer]).map((item) => item.id)).toEqual(["1", "2"]);
    expect(mergeProjects([older, other], [newer]).find((item) => item.id === "1")?.updatedAt).toBe(newer.updatedAt);
  });
});
