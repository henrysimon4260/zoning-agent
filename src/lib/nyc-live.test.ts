import { describe, expect, it } from "vitest";
import { chooseHits } from "@/lib/nyc";
import { lookupTaxLot, searchParcels } from "@/lib/nyc-lookup";

const live = process.env.NYC_LIVE === "0" ? it.skip : it;

async function parcelFor(query: string) {
  const hits = await searchParcels(query);
  const chosen = chooseHits(query, hits);
  expect(chosen.kind, query).toBe("one");
  if (chosen.kind !== "one") throw new Error(query);
  return lookupTaxLot(chosen.hit);
}

describe("live NYC parcels", () => {
  live("resolves real addresses in all five boroughs against the zoning layers ZoLa uses", async () => {
    const centre = await parcelFor("1 Centre Street, Manhattan");
    expect(centre.bbl).toBe("1001210001");
    expect(centre.zoningDistricts).toEqual(["C6-4"]);
    expect(centre.landmark).toMatch(/LANDMARK/);
    expect(centre.transitZone).toMatch(/Manhattan Core/);
    expect(centre.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/1/121/1");
    expect(centre.certificateOfOccupancy?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(centre.splitZone).toBe(false);

    const willow = await parcelFor("20 Willow Street, Brooklyn");
    expect(willow.bbl).toBe("3002140016");
    expect(willow.zoningDistricts).toEqual(["R6"]);
    expect(willow.limitedHeight).toBe("LH-1");
    expect(willow.historicDistrict).toMatch(/Brooklyn Heights/);
    expect(willow.transitZone).toMatch(/Inner Transit/);
    expect(willow.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/3/214/16");

    const bay = await parcelFor("475 Bay Ridge Parkway, Brooklyn");
    expect(bay.bbl).toBe("3059300057");
    expect(bay.zoningDistricts).toEqual(["R5B", "R6B"]);
    expect(bay.commercialOverlays).toEqual(["C1-3"]);
    expect(bay.specialDistricts.join(" ")).toMatch(/Bay Ridge/);
    expect(bay.specialDistricts.join(" ")).toMatch(/\(BR\)/);
    expect(bay.splitZone).toBe(true);
    expect(bay.historicDistrict).toMatch(/Bay Ridge Parkway/);
    expect(bay.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/3/5930/57");

    const queens = await parcelFor("1 Court Square, Queens");
    expect(queens.bbl).toBe("4000790030");
    expect(queens.zoningDistricts).toEqual(["C5-3"]);
    expect(queens.specialDistricts.join(" ")).toMatch(/Long Island City/);
    expect(queens.subdistricts.join(" ")).toMatch(/Court Square/);
    expect(queens.transitZone).toMatch(/Manhattan Core/);
    expect(queens.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/4/79/30");

    const bronx = await parcelFor("851 Grand Concourse, Bronx");
    expect(bronx.bbl).toBe("2024680001");
    expect(bronx.zoningDistricts).toEqual(["R8"]);
    expect(bronx.specialDistricts.join(" ")).toMatch(/Grand Concourse/);
    expect(bronx.historicDistrict).toMatch(/Grand Concourse/);
    expect(bronx.landmark).toMatch(/LANDMARK/);
    expect(bronx.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/2/2468/1");

    const island = await parcelFor("10 Richmond Terrace, Staten Island");
    expect(island.bbl).toBe("5000070001");
    expect(island.zoningDistricts).toEqual(["C4-2"]);
    expect(island.specialDistricts.join(" ")).toMatch(/St\. George/);
    expect(island.subdistricts.join(" ")).toMatch(/Upland/);
    expect(island.landmark).toMatch(/LANDMARK/);
    expect(island.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/5/7/1");

    const condo = await parcelFor("15 Central Park West, Manhattan");
    expect(condo.bbl).toBe("1011147503");
    expect(condo.billingLot).toBe(true);
    expect(condo.condoNumber).toBe("1653");
    expect(condo.zoningDistricts).toEqual(["C4-7"]);
    expect(condo.specialDistricts.join(" ")).toMatch(/Lincoln Square/);
    expect(condo.subdistricts.join(" ")).toMatch(/Subdistrict C/);
    expect(condo.zolaUrl).toBe("https://zola.planning.nyc.gov/lot/1/1114/7503");

    const warren = await parcelFor("86 Warren Street, Manhattan");
    expect(warren.bbl).toBe("1001370010");
    expect(warren.zoningDistricts).toEqual(["C6-3A"]);
    expect(warren.specialDistricts.join(" ")).toMatch(/Tribeca/);
    expect(warren.eDesignations.map((item) => item.id)).toContain("E-61");
    expect(warren.eDesignations.find((item) => item.id === "E-61")?.note).toMatch(/Attenuation/);

    const water = await parcelFor("5-37 46 Avenue, Queens");
    expect(water.bbl).toBe("4000260017");
    expect(water.waterfront).toMatch(/Hunters Point/);
    expect(water.zoningDistricts.join(" ")).toMatch(/M1-6A/);

    const zola = await fetch(centre.zolaUrl, { signal: AbortSignal.timeout(15000) });
    expect(zola.status).toBe(200);
  }, 180000);
});
