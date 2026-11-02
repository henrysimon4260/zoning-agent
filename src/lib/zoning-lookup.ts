import { completeText, grokConfigured, grokWebSearch } from "@/lib/llm";
import { sanitizeTopic } from "@/lib/sources";
import type { ProjectProfile, ZoningFindings } from "@/lib/types";

const HOSTS = ["municode.com", "amlegal.com", "ecode360.com", "codepublishing.com", "municipalcodeonline.com", ".gov"];

function placeQuery(profile: ProjectProfile): string {
  return [profile.city, profile.county, profile.state, profile.zoningDistrict, "zoning ordinance"]
    .filter(Boolean)
    .join(" ");
}

export async function lookupZoning(profile: ProjectProfile): Promise<ZoningFindings | null> {
  if (!profile.city && !profile.county && !profile.state) return null;
  if (!grokConfigured()) return null;
  const query = placeQuery(profile);
  try {
    const searched = await grokWebSearch(
      `Find the adopted zoning code for: ${query}. Prefer Municode, American Legal, eCode360, or a city .gov page. Summarize only rules you can point to, and list the source URLs.`,
    );
    const links = searched?.urls?.length ? searched.urls : await duckLinks(query);
    const pages = await fetchPages(links.slice(0, 2));
    const excerpt = [searched?.text, ...pages.map((page) => page.text)].filter(Boolean).join("\n\n").slice(0, 14000);
    const sources = [...(searched?.urls ?? []), ...pages.map((page) => ({ label: page.label, url: page.url }))].filter(
      (source, index, all) => all.findIndex((item) => item.url === source.url) === index,
    );
    if (!excerpt.trim() && sources.length === 0) return null;
    return await findingsFromPages(profile, excerpt, sources, pages.length > 0);
  } catch (error) {
    console.error("Zoning lookup failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

async function findingsFromPages(
  profile: ProjectProfile,
  excerpt: string,
  sources: { label: string; url: string }[],
  trustedExcerpt: boolean,
): Promise<ZoningFindings | null> {
  const raw = await completeText(
    [
      {
        role: "system",
        content:
          "You extract zoning standards from ordinance text. Return JSON only. Never invent a number, a distance, a ratio, or a permission. If the excerpt does not state it, leave the array empty and verified false. Quote the rule in your own short sentences and include only figures that appear in the excerpt.",
      },
      {
        role: "user",
        content: `Jurisdiction: ${[profile.city, profile.county, profile.state].filter(Boolean).join(", ")}
District: ${profile.zoningDistrict || "unknown"}
Overlays: ${profile.overlays.join(", ") || "none named"}
Occupancy on the architectural file: ${profile.occupancy.join(", ") || "unknown"}

Excerpt:
${excerpt.slice(0, 12000)}

Return JSON:
{
  "codeTitle": string,
  "use": { "requirements": string[], "exceptions": string[], "verified": boolean },
  "setbacks": { "requirements": string[], "exceptions": string[], "verified": boolean },
  "height": { "requirements": string[], "exceptions": string[], "verified": boolean },
  "far": { "requirements": string[], "exceptions": string[], "verified": boolean },
  "coverage": { "requirements": string[], "exceptions": string[], "verified": boolean },
  "parking": { "requirements": string[], "exceptions": string[], "verified": boolean },
  "overlay": { "requirements": string[], "exceptions": string[], "verified": boolean }
}`,
      },
    ],
    true,
  );
  if (!raw) return { sources, codeTitle: undefined };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const topic = (key: string) => {
      const cleaned = sanitizeTopic(parsed[key] as { requirements?: string[]; exceptions?: string[]; verified?: boolean }, excerpt);
      if (!cleaned || trustedExcerpt) return cleaned;
      return { ...cleaned, verified: false };
    };
    return {
      codeTitle: typeof parsed.codeTitle === "string" ? parsed.codeTitle : undefined,
      sources,
      use: topic("use"),
      setbacks: topic("setbacks"),
      height: topic("height"),
      far: topic("far"),
      coverage: topic("coverage"),
      parking: topic("parking"),
      overlay: topic("overlay"),
    };
  } catch {
    return { sources };
  }
}

async function duckLinks(query: string): Promise<{ label: string; url: string }[]> {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "LintelCodeDesk/1.0" },
  });
  if (!response.ok) return [];
  const html = await response.text();
  const links: { label: string; url: string }[] = [];
  const pattern = /uddg=([^&"]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && links.length < 5) {
    const url = decodeURIComponent(match[1]);
    if (!/^https?:/i.test(url)) continue;
    if (!HOSTS.some((host) => url.includes(host))) continue;
    if (links.some((link) => link.url === url)) continue;
    links.push({ label: hostLabel(url), url });
  }
  return links;
}

async function fetchPages(links: { label: string; url: string }[]): Promise<{ label: string; url: string; text: string }[]> {
  const pages = await Promise.all(
    links.map(async (link) => {
      try {
        const response = await fetch(link.url, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "LintelCodeDesk/1.0" },
        });
        if (!response.ok) return null;
        const type = response.headers.get("content-type") ?? "";
        if (!type.includes("text") && !type.includes("html") && type) return null;
        const html = (await response.text()).slice(0, 180000);
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 6000);
        return text.trim() ? { ...link, text } : null;
      } catch {
        return null;
      }
    }),
  );
  return pages.filter((page): page is { label: string; url: string; text: string } => Boolean(page));
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Ordinance source";
  }
}
