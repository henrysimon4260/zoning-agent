import {
  isCondoUnitLot,
  lpcHistoricName,
  mergeParcelLayers,
  parcelFromPluto,
  type GeoHit,
  type LayerFacts,
} from "@/lib/nyc";
import type { NycParcel } from "@/lib/types";

const DCP = "https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services";
const PLUTO = `${DCP}/MAPPLUTO/FeatureServer/0/query`;

export class TaxLotMissing extends Error {}
export class CityDataUnavailable extends Error {}

type Attribute = Record<string, string | number | null>;
type Feature = { attributes: Attribute; geometry?: { rings?: number[][][] } };

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url: string, init?: RequestInit, attempts = 3): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`HTTP ${response.status}`);
        await wait(250 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt === attempts - 1) break;
      await wait(250 * (attempt + 1));
    }
  }
  throw last instanceof Error ? last : new CityDataUnavailable("City data didn't answer.");
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(label, error instanceof Error ? error.message : "failed");
    return null;
  }
}

export async function searchParcels(text: string): Promise<GeoHit[]> {
  const body = (await getJson(`https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(text)}`, undefined, 2)) as {
    features?: {
      properties?: {
        label?: string;
        housenumber?: string;
        street?: string;
        borough?: string;
        postalcode?: string;
        addendum?: { pad?: { bbl?: string; bin?: string } };
      };
    }[];
  };
  return (body.features ?? []).map((feature) => ({
    label: feature.properties?.label ?? "",
    borough: feature.properties?.borough ?? "",
    housenumber: feature.properties?.housenumber ?? "",
    street: feature.properties?.street ?? "",
    postalcode: feature.properties?.postalcode ?? "",
    bbl: feature.properties?.addendum?.pad?.bbl ?? "",
    bin: feature.properties?.addendum?.pad?.bin ?? "",
  }));
}

async function queryFeatures(service: string, params: Record<string, string>): Promise<Feature[]> {
  const body = await getJson(`${DCP}/${service}/FeatureServer/0/query`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ f: "json", returnGeometry: "false", ...params }),
  }, 2) as { features?: Feature[]; error?: unknown };
  if (body.error) throw new Error(`${service} rejected the query`);
  return body.features ?? [];
}

async function queryLayer(service: string, params: Record<string, string>): Promise<Attribute[]> {
  const features = await queryFeatures(service, params);
  return features.map((feature) => feature.attributes);
}

async function mapPluto(bbl: string): Promise<Feature | null> {
  const body = await getJson(PLUTO, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      f: "json",
      where: `BBL=${bbl}`,
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
    }),
  }) as { features?: Feature[]; error?: unknown };
  if (body.error) throw new Error("MapPLUTO rejected the query");
  return body.features?.[0] ?? null;
}

async function socrataPluto(bbl: string): Promise<Attribute | null> {
  const url = new URL("https://data.cityofnewyork.us/resource/64uk-42ks.json");
  url.searchParams.set("$where", `bbl='${bbl}'`);
  url.searchParams.set("$limit", "1");
  const rows = (await getJson(url.toString(), undefined, 2)) as Attribute[];
  return rows[0] ?? null;
}

function attrText(value: string | number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function intersect(service: string, rings: number[][][], fields: string): Promise<Attribute[]> {
  return queryLayer(service, {
    geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: fields,
  });
}

async function certificates(bin: string): Promise<NycParcel["certificateOfOccupancy"] | "none"> {
  const url = new URL("https://data.cityofnewyork.us/resource/bs8b-p36w.json");
  url.searchParams.set("$where", `bin_number='${bin}'`);
  url.searchParams.set("$order", "c_o_issue_date DESC");
  url.searchParams.set("$limit", "12");
  const rows = (await getJson(url.toString(), undefined, 2)) as {
    c_o_issue_date?: string;
    job_type?: string;
    issue_type?: string;
  }[];
  if (!rows.length) return "none";
  const latest = rows[0];
  const final = rows.find((row) => /final/i.test(row.issue_type ?? ""));
  const issueType = latest.issue_type ?? "";
  const latestDate = (latest.c_o_issue_date ?? "").slice(0, 10);
  const finalDate = final ? (final.c_o_issue_date ?? "").slice(0, 10) : "";
  return {
    date: latestDate,
    jobType: latest.job_type ?? "",
    issueType,
    provisional: /temp/i.test(issueType),
    latestFinalDate: final && finalDate !== latestDate ? finalDate : "",
  };
}

export async function lookupTaxLot(hit: GeoHit): Promise<NycParcel> {
  const bbl = digits(hit.bbl);
  if (!bbl) throw new TaxLotMissing("GeoSearch did not return a BBL.");
  let feature: Feature | null = null;
  let arcgisDown = false;
  try {
    feature = await mapPluto(bbl);
  } catch (error) {
    arcgisDown = true;
    console.error("mappluto", error instanceof Error ? error.message : "failed");
  }
  let row: Attribute | null = feature?.attributes ?? null;
  let rings = feature?.geometry?.rings ?? null;
  if (!row) {
    try {
      row = await socrataPluto(bbl);
    } catch (error) {
      console.error("socrata", error instanceof Error ? error.message : "failed");
      throw new CityDataUnavailable("MapPLUTO didn't answer.");
    }
    rings = null;
    if (!row && arcgisDown) throw new CityDataUnavailable("MapPLUTO didn't answer.");
  }
  if (!row) throw new TaxLotMissing(`MapPLUTO has no tax lot for BBL ${bbl}.`);

  let unitBbl = "";
  const lot = attrText(row.Lot ?? row.lot);
  const condo = attrText(row.CondoNo ?? row.condono);
  let billingGap = "";
  if (isCondoUnitLot(lot, condo)) {
    const boro = digits(attrText(row.BoroCode ?? row.borocode)) || bbl.slice(0, 1);
    const block = digits(attrText(row.Block ?? row.block)) || String(Number(bbl.slice(1, 6)));
    const billing = await safe("condo-billing", () => queryFeatures("MAPPLUTO", {
      where: `CondoNo=${digits(condo)} AND BoroCode=${boro} AND Block=${block} AND Lot>=7501 AND Lot<=7599`,
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
    }));
    const billingFeature = [...(billing ?? [])].sort((left, right) => {
      const area = (value: Attribute) => {
        const raw = value.LotArea ?? value.lotarea;
        return typeof raw === "number" ? raw : Number(raw) || 0;
      };
      return area(right.attributes) - area(left.attributes);
    })[0];
    if (billingFeature) {
      unitBbl = attrText(row.BBL ?? row.bbl) || bbl;
      row = billingFeature.attributes;
      if (billingFeature.geometry?.rings?.length) rings = billingFeature.geometry.rings;
    } else {
      billingGap = "This is a condo unit lot, and the billing lot did not come back. Zoning below is the unit lot only.";
    }
  }

  const base = parcelFromPluto(row, { ...hit, bbl: attrText(row.BBL ?? row.bbl) || bbl });
  if (unitBbl) base.unitBbl = unitBbl;
  if (billingGap) base.layerGaps.push(billingGap);

  const facts = await readLayers(attrText(row.BBL ?? row.bbl) || bbl, rings);
  const merged = mergeParcelLayers(base, facts);
  const bin = digits(hit.bin);
  if (bin) {
    const co = await safe("dob-co", () => certificates(bin));
    if (co === null) merged.layerGaps.push("DOB BIS certificate-of-occupancy records did not answer.");
    else if (co !== "none") merged.certificateOfOccupancy = co;
  }
  return merged;
}

async function readLayers(bbl: string, rings: number[][][] | null): Promise<LayerFacts> {
  const blank: LayerFacts = {
    spatial: Boolean(rings?.length),
    zoningDistricts: null,
    commercialOverlays: null,
    specialDistricts: null,
    subdistricts: null,
    limitedHeight: null,
    eDesignations: null,
    inclusionaryHousing: null,
    mandatoryInclusionary: null,
    transitZone: null,
    waterfront: null,
    historicDistrict: null,
  };
  const edes = await safe("edes", () => queryLayer("nyedesignations", {
    where: `BBL=${bbl}`,
    outFields: "ENUMBER,DESCRIPTION",
  }));
  blank.eDesignations = edes ? edes.map((row) => ({ id: attrText(row.ENUMBER), note: attrText(row.DESCRIPTION) })) : null;
  if (!rings?.length) return blank;

  const [zoning, overlays, special, subs, limited, mih, ih, transit, water, historic] = await Promise.all([
    safe("nyzd", () => intersect("nyzd", rings, "ZONEDIST")),
    safe("nyco", () => intersect("nyco", rings, "OVERLAY")),
    safe("nysp", () => intersect("nysp", rings, "SDNAME,SDLBL")),
    safe("nysp_sd", () => intersect("nysp_sd", rings, "SUBDIST,SUBDIST_LBL")),
    safe("nylh", () => intersect("nylh", rings, "LHLBL")),
    safe("nycmih", () => intersect("nycmih", rings, "ProjectNam,MIH_Option")),
    safe("nyih", () => intersect("nyih", rings, "ProjectNam")),
    safe("transit", () => intersect("ZoLa_TransitZones", rings, "TranstZone")),
    safe("water", () => intersect("nywap", rings, "Name")),
    safe("historic", () => intersect("v_GFT_Historic_Districts", rings, "variable_id,variable_type")),
  ]);

  return {
    spatial: true,
    zoningDistricts: zoning ? zoning.map((row) => attrText(row.ZONEDIST)) : null,
    commercialOverlays: overlays ? overlays.map((row) => attrText(row.OVERLAY)) : null,
    specialDistricts: special ? special.map((row) => ({ name: attrText(row.SDNAME), code: attrText(row.SDLBL) })) : null,
    subdistricts: subs ? subs.map((row) => ({ name: attrText(row.SUBDIST), label: attrText(row.SUBDIST_LBL) })) : null,
    limitedHeight: limited ? attrText(limited[0]?.LHLBL) : null,
    eDesignations: blank.eDesignations,
    inclusionaryHousing: ih ? ih.map((row) => attrText(row.ProjectNam)) : null,
    mandatoryInclusionary: mih
      ? mih.map((row) => {
          const name = attrText(row.ProjectNam);
          const option = attrText(row.MIH_Option);
          return option ? `${name} (${option})` : name;
        })
      : null,
    transitZone: transit ? attrText(transit[0]?.TranstZone) : null,
    waterfront: water ? water.map((row) => attrText(row.Name)) : null,
    historicDistrict: historic
      ? historic.map((row) => lpcHistoricName(attrText(row.variable_id), attrText(row.variable_type))).filter(Boolean).join("; ")
      : null,
  };
}
