import { rateLimitResponse } from "@/lib/rate-limit";
import { NYC_BOROUGHS } from "@/lib/nyc";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Feature = {
  properties?: {
    label?: string;
    borough?: string;
    addendum?: { pad?: { bbl?: string } };
  };
};

export async function GET(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  const text = new URL(request.url).searchParams.get("text")?.trim() ?? "";
  if (text.length < 3) return NextResponse.json({ suggestions: [] });
  try {
    const response = await fetch(`https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(text)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return NextResponse.json({ suggestions: [] });
    const body = (await response.json()) as { features?: Feature[] };
    const suggestions = (body.features ?? [])
      .map((feature) => ({
        label: feature.properties?.label ?? "",
        borough: feature.properties?.borough ?? "",
        bbl: feature.properties?.addendum?.pad?.bbl ?? "",
      }))
      .filter((item) => item.label && NYC_BOROUGHS.includes(item.borough as (typeof NYC_BOROUGHS)[number]))
      .filter((item, index, all) => all.findIndex((other) => other.bbl === item.bbl || other.label === item.label) === index)
      .slice(0, 6);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
