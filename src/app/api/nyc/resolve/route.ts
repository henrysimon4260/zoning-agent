import { chooseHits, describeParcel, mentionsOutsideNewYork, type ResolveResult } from "@/lib/nyc";
import { CityDataUnavailable, lookupTaxLot, searchParcels, TaxLotMissing } from "@/lib/nyc-lookup";
import { rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim() ?? "";
  if (!text) {
    return NextResponse.json({ status: "not_found", prompt: "Give me a street address in New York City." } satisfies ResolveResult);
  }
  if (mentionsOutsideNewYork(text)) {
    return NextResponse.json({
      status: "outside",
      prompt: "Lintel is set up for New York City. That address is outside the five boroughs. Try a street address in Manhattan, Brooklyn, Queens, the Bronx, or Staten Island.",
    } satisfies ResolveResult);
  }
  try {
    const hits = await searchParcels(text);
    const chosen = chooseHits(text, hits);
    if (chosen.kind === "none") {
      return NextResponse.json({
        status: "not_found",
        prompt: `I couldn't match ${text} to a house number and street in the five boroughs. Add the borough, or try the address the way it appears on the building.`,
      } satisfies ResolveResult);
    }
    if (chosen.kind === "many") {
      const choices = chosen.hits.map((hit) => ({ label: hit.label, borough: hit.borough, bbl: hit.bbl }));
      return NextResponse.json({
        status: "ambiguous",
        prompt: `I found more than one parcel. Which one? ${choices.map((choice) => `${choice.label} (BBL ${choice.bbl})`).join(" · ")}`,
        choices,
      } satisfies ResolveResult);
    }
    const parcel = await lookupTaxLot(chosen.hit);
    return NextResponse.json({
      status: "ok",
      parcel,
      acknowledgement: describeParcel(parcel),
    } satisfies ResolveResult);
  } catch (error) {
    console.error("NYC resolve failed", error instanceof Error ? error.message : "unknown");
    if (error instanceof TaxLotMissing) {
      return NextResponse.json({
        status: "not_found",
        prompt: error.message || "GeoSearch found an address, but MapPLUTO didn't return a tax lot. Check it on ZoLa.",
      } satisfies ResolveResult);
    }
    const prompt = error instanceof CityDataUnavailable
      ? "City data didn't answer just now. Try the address again in a moment."
      : "City data didn't answer just now. Try the address again in a moment.";
    return NextResponse.json({ status: "not_found", prompt } satisfies ResolveResult);
  }
}
