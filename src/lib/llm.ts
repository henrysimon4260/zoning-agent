import { DEFAULT_OPENAI_BASE, loadSettings } from "@/lib/settings";

export type LlmProvider = "openai" | "anthropic";

export type LlmConfig = {
  openaiKey: string;
  openaiModel: string;
  openaiBase: string;
  anthropicKey: string;
  anthropicModel: string;
  tavilyKey: string;
};

type Message = { role: "system" | "user" | "assistant"; content: string };

export function llmConfigFromSettings(): LlmConfig {
  const settings = loadSettings();
  return {
    openaiKey: settings.openaiKey.trim(),
    openaiModel: settings.openaiModel.trim() || "gpt-4o-mini",
    openaiBase: (settings.openaiBase.trim() || DEFAULT_OPENAI_BASE).replace(/\/$/, ""),
    anthropicKey: settings.anthropicKey.trim(),
    anthropicModel: settings.anthropicModel.trim() || "claude-3-5-haiku-latest",
    tavilyKey: settings.tavilyKey.trim(),
  };
}

export function llmProvider(config: LlmConfig = llmConfigFromSettings()): LlmProvider | null {
  if (config.openaiKey || (config.openaiBase && config.openaiBase !== DEFAULT_OPENAI_BASE)) return "openai";
  if (config.anthropicKey) return "anthropic";
  return null;
}

export function llmConfigured(config: LlmConfig = llmConfigFromSettings()): boolean {
  return llmProvider(config) !== null;
}

export async function completeText(config: LlmConfig, messages: Message[], json = false): Promise<string | null> {
  const provider = llmProvider(config);
  if (!provider) return null;
  try {
    if (provider === "openai") return await openAiComplete(config, messages, json);
    return await anthropicComplete(config, messages);
  } catch (error) {
    console.error("LLM request failed", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export async function streamText(config: LlmConfig, messages: Message[], onDelta: (chunk: string) => void): Promise<boolean> {
  const provider = llmProvider(config);
  if (!provider) return false;
  try {
    if (provider === "openai") return await openAiStream(config, messages, onDelta);
    return await anthropicStream(config, messages, onDelta);
  } catch (error) {
    console.error("LLM stream failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

async function openAiComplete(config: LlmConfig, messages: Message[], json: boolean): Promise<string | null> {
  const response = await fetch(`${config.openaiBase}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      ...(config.openaiKey ? { Authorization: `Bearer ${config.openaiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: json ? 0 : 0.4,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? null;
}

async function openAiStream(config: LlmConfig, messages: Message[], onDelta: (chunk: string) => void): Promise<boolean> {
  const response = await fetch(`${config.openaiBase}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      ...(config.openaiKey ? { Authorization: `Bearer ${config.openaiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
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
}

function anthropicHeaders(config: LlmConfig): HeadersInit {
  return {
    "x-api-key": config.anthropicKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "Content-Type": "application/json",
  };
}

async function anthropicComplete(config: LlmConfig, messages: Message[]): Promise<string | null> {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const chat = messages.filter((message) => message.role !== "system");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: anthropicHeaders(config),
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 1200,
      system,
      messages: chat.map((message) => ({ role: message.role, content: message.content })),
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { content?: { text?: string }[] };
  return body.content?.map((part) => part.text ?? "").join("") || null;
}

async function anthropicStream(config: LlmConfig, messages: Message[], onDelta: (chunk: string) => void): Promise<boolean> {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const chat = messages.filter((message) => message.role !== "system");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: anthropicHeaders(config),
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 400,
      stream: true,
      system,
      messages: chat.map((message) => ({ role: message.role, content: message.content })),
    }),
  });
  if (!response.ok || !response.body) return false;
  await readSse(response.body, (data) => {
    const parsed = JSON.parse(data) as { type?: string; delta?: { text?: string } };
    if (parsed.type === "content_block_delta" && parsed.delta?.text) onDelta(parsed.delta.text);
  });
  return true;
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
