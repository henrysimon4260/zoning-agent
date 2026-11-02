type Message = { role: "system" | "user" | "assistant"; content: string };

const XAI_BASE = "https://api.x.ai/v1";
const DEFAULT_XAI_MODEL = "grok-4.7";

type GrokConfig = { key: string; model: string; base: string };

export function grokConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

function grokConfig(): GrokConfig | null {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  return {
    key,
    model: process.env.XAI_MODEL || DEFAULT_XAI_MODEL,
    base: XAI_BASE,
  };
}

export async function completeText(messages: Message[], json = false): Promise<string | null> {
  const config = grokConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: json ? 0 : 0.4,
        messages,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.error("Grok request failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export async function streamText(messages: Message[], onDelta: (chunk: string) => void): Promise<boolean> {
  const config = grokConfig();
  if (!config) return false;
  try {
    const response = await fetch(`${config.base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        stream: true,
        messages,
      }),
    });
    if (!response.ok || !response.body) return false;
    await readSse(response.body, (data) => {
      if (data === "[DONE]") return;
      const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
      const chunk = parsed.choices?.[0]?.delta?.content;
      if (chunk) onDelta(chunk);
    });
    return true;
  } catch (error) {
    console.error("Grok stream failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

export async function grokWebSearch(query: string): Promise<{ text: string; urls: { label: string; url: string }[] } | null> {
  const config = grokConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.base}/responses`, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          tools: [{ type: "web_search" }],
          input: query,
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        output_text?: string;
        output?: { content?: { text?: string; annotations?: { url?: string; title?: string }[] }[] }[];
      };
      const urls: { label: string; url: string }[] = [];
      for (const block of body.output ?? []) {
        for (const part of block.content ?? []) {
          for (const note of part.annotations ?? []) {
            if (note.url) urls.push({ label: note.title || hostLabel(note.url), url: note.url });
          }
        }
      }
      const text =
        body.output_text ||
        (body.output ?? []).flatMap((block) => block.content ?? []).map((part) => part.text ?? "").join("\n");
      if (text || urls.length) return { text, urls };
  } catch (error) {
    console.error("Grok web search failed", error instanceof Error ? error.message : "unknown");
  }
  return null;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Ordinance source";
  }
}

async function readSse(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() ?? "";
    for (const line of chunks) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        onData(data);
      } catch {
        // Ignore a malformed stream event and keep reading.
      }
    }
  }
}

export const ACK_SYSTEM = `You are Lintel, a calm senior code consultant sitting with an architect. Write one or two sentences acknowledging only what the user just told you. Do not ask a question. Do not give code advice. Do not use bullet lists, headings, or emoji. Do not invent facts they did not state.`;

export function stripQuestions(text: string): string {
  const kept = text
    .split(/(?<=[.!])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !sentence.includes("?"));
  return kept.join(" ").trim();
}
