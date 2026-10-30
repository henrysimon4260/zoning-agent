import type { ProjectProfile } from "@/lib/types";
import { ICC_CODE_URL } from "@/lib/types";

export function modelCodeSource(): { label: string; url: string } {
  return { label: "2021 IBC, ICC Digital Codes", url: ICC_CODE_URL };
}

export function zoningSearchLinks(profile: Pick<ProjectProfile, "city" | "county" | "state" | "zoningDistrict">): { label: string; url: string }[] {
  const place = [profile.city, profile.county, profile.state, profile.zoningDistrict].filter(Boolean).join(" ");
  const base = place.trim() || "zoning ordinance";
  const query = encodeURIComponent(`${base} zoning code`);
  return [
    {
      label: "Search Municode",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${base} zoning code site:library.municode.com`)}`,
    },
    {
      label: "Search American Legal",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${base} zoning ordinance site:codelibrary.amlegal.com`)}`,
    },
    {
      label: "Search the ordinance",
      url: `https://www.google.com/search?q=${query}`,
    },
  ];
}

export function sanitizeTopic(
  topic: { requirements?: string[]; exceptions?: string[]; verified?: boolean } | undefined,
  excerpt: string,
): { requirements: string[]; exceptions: string[]; verified: boolean } | undefined {
  if (!topic) return undefined;
  const requirements = (topic.requirements ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 8);
  const exceptions = (topic.exceptions ?? []).map((line) => line.trim()).filter(Boolean).slice(0, 6);
  if (requirements.length === 0 && exceptions.length === 0) return undefined;
  const blob = `${requirements.join(" ")} ${exceptions.join(" ")}`;
  const numbers = blob.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const grounded = numbers.every((number) => {
    const plain = number.replace(/,/g, "");
    return excerpt.includes(number) || excerpt.includes(plain);
  });
  return {
    requirements,
    exceptions,
    verified: Boolean(topic.verified) && grounded && excerpt.trim().length > 0,
  };
}
