import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/lib/checklist";
import { nextQuestion } from "@/lib/interview";
import {
  applyParcel,
  chooseHits,
  contextualizeChecklist,
  isCondoUnitLot,
  lpcHistoricName,
  mentionsOutsideNewYork,
  mergeParcelLayers,
  parcelFromPluto,
  type GeoHit,
  type LayerFacts,
} from "@/lib/nyc";
import { emptyProfile } from "@/lib/storage";

const centreHit: GeoHit = {
  label: "1 CENTRE STREET, New York, NY, USA",
  borough: "Manhattan",
  housenumber: "1",
  street: "CENTRE STREET",
  postalcode: "10007",
  bbl: "1001210001",
  bin: "1001394",
};

const bronxHit: GeoHit = {
  label: "1 CENTER STREET, Bronx, NY, USA",
  borough: "Bronx",
  housenumber: "1",
  street: "CENTER STREET",
  postalcode: "10464",
  bbl: "2056270046",
  bin: "2000000",
};

const willowHit: GeoHit = {
  label: "20 WILLOW STREET, Brooklyn, NY, USA",
  borough: "Brooklyn",
  housenumber: "20",
  street: "WILLOW STREET",
  postalcode: "11201",
  bbl: "3002140016",
  bin: "3001553",
};

describe("NYC address matching", () => {
  it("rejects a non-NYC place and accepts a borough address", () => {
    expect(mentionsOutsideNewYork("412 East Pine Street, Seattle")).toBe(true);
    expect(mentionsOutsideNewYork("1 Centre Street, Manhattan")).toBe(false);
    expect(mentionsOutsideNewYork("20 Willow Street, Brooklyn")).toBe(false);
  });

  it("picks Manhattan when the borough is named, and asks when it is not", () => {
    const hits = [bronxHit, centreHit];
    expect(chooseHits("1 Centre Street", hits).kind).toBe("many");
    const picked = chooseHits("1 Centre Street, Manhattan", hits);
    expect(picked.kind).toBe("one");
    if (picked.kind === "one") expect(picked.hit.bbl).toBe("1001210001");
  });

  it("keeps the Brooklyn rowhouse when Queens has the same street name", () => {
    const queens: GeoHit = { ...willowHit, borough: "Queens", bbl: "4081020023", label: "20 WILLOW STREET, Douglaston" };
    const picked = chooseHits("20 Willow Street, Brooklyn", [willowHit, queens]);
    expect(picked.kind).toBe("one");
    if (picked.kind === "one") expect(picked.hit.bbl).toBe("3002140016");
  });

  it("does not treat Lincoln Center as Centre Street", () => {
    const lincoln: GeoHit = { ...centreHit, street: "LINCOLN CENTER", label: "1 LINCOLN CENTER", bbl: "1011340001" };
    const picked = chooseHits("1 Centre Street, Manhattan", [centreHit, lincoln]);
    expect(picked.kind).toBe("one");
    if (picked.kind === "one") expect(picked.hit.bbl).toBe("1001210001");
  });

  it("keeps a Queens hyphenated house number intact", () => {
    const hunters: GeoHit = { ...centreHit, housenumber: "5-37", street: "46 AVENUE", borough: "Queens", bbl: "4000260017", label: "5-37 46 AVENUE" };
    const road: GeoHit = { ...hunters, housenumber: "5-37", street: "46 ROAD", bbl: "4000270005" };
    const picked = chooseHits("5-37 46 Avenue, Queens", [hunters, road]);
    expect(picked.kind).toBe("one");
    if (picked.kind === "one") expect(picked.hit.bbl).toBe("4000260017");
    expect(chooseHits("1 Court Square, Queens", [{ ...centreHit, housenumber: "45-01", street: "COURT SQUARE", borough: "Queens", bbl: "4000817501" }]).kind).toBe("none");
  });

  it("does not accept a different house number on the same avenue", () => {
    const other: GeoHit = { ...centreHit, housenumber: "218", street: "PENNSYLVANIA AVENUE", bbl: "3037200031" };
    expect(chooseHits("1600 Pennsylvania Avenue", [other]).kind).toBe("none");
  });
});

describe("MapPLUTO profile", () => {
  const centre = parcelFromPluto(
    {
      borough: "MN",
      block: "121",
      lot: "1",
      bbl: "1001210001.00000000",
      address: "1 CENTRE STREET",
      zipcode: "10007",
      zonedist1: "C6-4",
      bldgclass: "O4",
      lotarea: "50184",
      lotfront: "327.07",
      lotdepth: "182.11",
      builtfar: "21.05",
      residfar: "10",
      commfar: "10",
      facilfar: "10",
      yearbuilt: "1914",
      numfloors: "39",
      bldgarea: "1056600",
      landmark: "INDIVIDUAL LANDMARK",
      version: "26v2",
    },
    centreHit,
  );

  const willow = parcelFromPluto(
    {
      borough: "BK",
      block: "214",
      lot: "16",
      bbl: "3002140016.00000000",
      address: "20 WILLOW STREET",
      zonedist1: "R6",
      ltdheight: "LH-1",
      histdist: "Brooklyn Heights Historic District",
      lotarea: "1748",
      lotfront: "23",
      lotdepth: "76",
      builtfar: "2.55",
      residfar: "2.43",
      commfar: "0",
      facilfar: "4.8",
      bldgclass: "B1",
      yearbuilt: "1846",
      numfloors: "3.5",
      bldgarea: "4451",
      version: "26v2",
    },
    willowHit,
  );

  it("fills 1 Centre Street from the tax lot and skips the questions the city already answered", () => {
    const profile = applyParcel(emptyProfile(), centre);
    expect(profile.parcel?.bbl).toBe("1001210001");
    expect(profile.zoningDistrict).toBe("C6-4");
    expect(profile.county).toBe("New York County");
    expect(profile.parcel?.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/1/121/1");
    expect(profile.overlays).toContain("INDIVIDUAL LANDMARK");
    const next = nextQuestion(profile, ["jurisdiction", "zoning", "overlays", "lot", "frontage"]);
    expect(next?.id).toBe("occupancy");
    const items = buildChecklist(profile, null);
    const district = items.find((item) => item.id === "nyc-district");
    expect(district?.summary).toMatch(/C6-4/);
    expect(district?.sources.some((source) => source.url.includes("zola.planning.nyc.gov"))).toBe(true);
    expect(items.find((item) => item.id === "nyc-lpc")?.applies).toBe(true);
    expect(items.find((item) => item.id === "ibc-stories")?.citation).toBe("unverified");
  });

  it("keeps the Brooklyn Heights flag on the Willow Street rowhouse", () => {
    const profile = applyParcel(emptyProfile(), willow);
    expect(profile.county).toBe("Kings County");
    expect(profile.parcel?.limitedHeight).toBe("LH-1");
    expect(profile.parcel?.historicDistrict).toMatch(/Brooklyn Heights/);
    const items = contextualizeChecklist(profile, []);
    expect(items.find((item) => item.id === "nyc-lpc")?.applies).toBe(true);
    expect(items.find((item) => item.id === "nyc-far")?.requirements.join(" ")).toMatch(/2.55/);
  });
});

function quietLayers(patch: Partial<LayerFacts> = {}): LayerFacts {
  return {
    spatial: true,
    zoningDistricts: [],
    commercialOverlays: [],
    specialDistricts: [],
    subdistricts: [],
    limitedHeight: "",
    eDesignations: [],
    inclusionaryHousing: [],
    mandatoryInclusionary: [],
    transitZone: "",
    waterfront: [],
    historicDistrict: "",
    ...patch,
  };
}

describe("zoning layer merge", () => {
  it("reads an LPC historic-district name and ignores a national register label", () => {
    expect(lpcHistoricName("LP-00099-Brooklyn Heights Historic District", "nyc_historic_districts")).toBe("Brooklyn Heights Historic District");
    expect(lpcHistoricName("90NR01325 - Brooklyn Heights Historic District", "us_historic_places")).toBe("");
  });

  it("treats condo lots 1000–6999 as unit lots and 7500s as billing lots", () => {
    expect(isCondoUnitLot("1001", "1653")).toBe(true);
    expect(isCondoUnitLot("7503", "1653")).toBe(false);
    expect(isCondoUnitLot("16", "")).toBe(false);
  });

  it("unions a split lot and keeps the special-district name from the map layer", () => {
    const base = parcelFromPluto(
      {
        bbl: "3059300057",
        borough: "BK",
        block: "5930",
        lot: "57",
        address: "475 BAY RIDGE PARKWAY",
        zonedist1: "R5B",
        zonedist2: "R6B",
        overlay1: "C1-3",
        spdist1: "BR",
        splitzone: "Y",
        histdist: "Bay Ridge Parkway-Doctors' Row Historic District",
        trnstzone: "Outer Transit Zone",
      },
      { label: "475 BAY RIDGE PARKWAY", borough: "Brooklyn", housenumber: "475", street: "BAY RIDGE PARKWAY", postalcode: "11209", bbl: "3059300057", bin: "3148328" },
    );
    const merged = mergeParcelLayers(base, quietLayers({
      zoningDistricts: ["R5B", "R6B"],
      commercialOverlays: ["C1-3"],
      specialDistricts: [{ name: "Special Bay Ridge District ", code: "BR" }],
      transitZone: "Outer Transit Zone",
      historicDistrict: "Bay Ridge Parkway - Doctors' Row Historic District",
    }));
    expect(merged.splitZone).toBe(true);
    expect(merged.zoningDistricts).toEqual(["R5B", "R6B"]);
    expect(merged.specialDistricts).toEqual(["Special Bay Ridge District (BR)"]);
    expect(merged.commercialOverlays).toEqual(["C1-3"]);
    expect(merged.historicDistrict).toMatch(/Bay Ridge Parkway/);
    expect(merged.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/3/5930/57");
    expect(merged.layerGaps.some((gap) => /Historic district/.test(gap))).toBe(false);
  });

  it("keeps MapPLUTO when the LPC historic-district name is actually different", () => {
    const base = parcelFromPluto(
      { bbl: "3059300057", borough: "BK", block: "5930", lot: "57", histdist: "Bay Ridge Parkway-Doctors' Row Historic District", zonedist1: "R5B" },
      { label: "475 BAY RIDGE PARKWAY", borough: "Brooklyn", housenumber: "475", street: "BAY RIDGE PARKWAY", postalcode: "11209", bbl: "3059300057", bin: "" },
    );
    const merged = mergeParcelLayers(base, quietLayers({
      zoningDistricts: ["R5B"],
      historicDistrict: "Brooklyn Heights Historic District",
    }));
    expect(merged.historicDistrict).toMatch(/Doctors/);
    expect(merged.layerGaps.join(" ")).toMatch(/Historic district names differ/);
  });

  it("adds a district the zoning map shows when MapPLUTO missed it", () => {
    const base = parcelFromPluto(
      { bbl: "1001210001", borough: "MN", block: "121", lot: "1", address: "1 CENTRE STREET", zonedist1: "C6-4" },
      centreHit,
    );
    const merged = mergeParcelLayers(base, quietLayers({ zoningDistricts: ["C6-4", "C6-2"] }));
    expect(merged.zoningDistricts).toEqual(["C6-4", "C6-2"]);
    expect(merged.splitZone).toBe(true);
    expect(merged.layerGaps.join(" ")).toMatch(/Zoning districts differ/);
  });

  it("keeps an E-designation description and a subdistrict label", () => {
    const warren = parcelFromPluto(
      {
        bbl: "1001370010",
        borough: "MN",
        block: "137",
        lot: "10",
        address: "86 WARREN STREET",
        zonedist1: "C6-3A",
        spdist1: "TMU",
        edesignum: "E-61",
      },
      { ...centreHit, bbl: "1001370010", label: "86 WARREN STREET", street: "WARREN STREET", housenumber: "86" },
    );
    const merged = mergeParcelLayers(warren, quietLayers({
      zoningDistricts: ["C6-3A"],
      specialDistricts: [{ name: "Special Tribeca Mixed Use District", code: "TMU" }],
      subdistricts: [{ name: "None", label: "" }, { name: "Area A2", label: "A2" }],
      eDesignations: [{ id: "E-61", note: "Window Wall Attenuation & Alternate Ventilation" }],
    }));
    expect(merged.eDesignations).toEqual([{ id: "E-61", note: "Window Wall Attenuation & Alternate Ventilation" }]);
    expect(merged.subdistricts).toEqual(["Area A2 (A2)"]);
    expect(merged.specialDistricts[0]).toMatch(/Tribeca/);
    const items = contextualizeChecklist(applyParcel(emptyProfile(), merged), []);
    expect(items.find((item) => item.id === "nyc-edesign")?.applies).toBe(true);
    expect(items.find((item) => item.id === "nyc-edesign")?.summary).toMatch(/Window Wall/);
    expect(items.find((item) => item.id === "nyc-fresh")?.applies).toBe(false);
  });

  it("records one gap when the lot has no geometry instead of a failure per layer", () => {
    const base = parcelFromPluto(
      { bbl: "1001210001", borough: "MN", block: "121", lot: "1", zonedist1: "C6-4" },
      centreHit,
    );
    const merged = mergeParcelLayers(base, quietLayers({ spatial: false, zoningDistricts: null, eDesignations: [] }));
    expect(merged.zoningDistricts).toEqual(["C6-4"]);
    expect(merged.layerGaps).toEqual([
      "Lot geometry was missing, so the zoning map layers were not intersected. Districts below are from MapPLUTO only.",
    ]);
  });
});
