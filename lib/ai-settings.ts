import "server-only";
import { cookies } from "next/headers";

export const KEY_COOKIE = "planning_ai_key";
export const PROVIDER_COOKIE = "planning_ai_provider";
export type AiProvider = "auto" | "claude" | "gemini" | "groq";

function providerName(value: unknown): AiProvider | null {
  return value === "auto" || value === "claude" || value === "gemini" || value === "groq" ? value : null;
}

function serverSettings() {
  const preferred = providerName(process.env.AI_PROVIDER?.trim().toLowerCase());
  const keys: Record<AiProvider, string | undefined> = {
    auto: undefined,
    claude: process.env.ANTHROPIC_API_KEY?.trim(),
    gemini: process.env.GEMINI_API_KEYS?.trim() || process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim(),
    groq: process.env.GROQ_API_KEYS?.trim() || process.env.GROQ_API_KEY?.trim(),
  };
  const autoKeys = JSON.stringify({ groq: keys.groq || "", gemini: keys.gemini || "" });

  if ((preferred === "auto" || (!preferred && keys.groq && keys.gemini)) && (keys.groq || keys.gemini)) {
    return { apiKey: autoKeys, provider: "auto" as const, source: "server" as const };
  }
  if (preferred && keys[preferred]) {
    return { apiKey: keys[preferred], provider: preferred, source: "server" as const };
  }
  if (keys.groq) return { apiKey: keys.groq, provider: "groq" as const, source: "server" as const };
  if (keys.gemini) return { apiKey: keys.gemini, provider: "gemini" as const, source: "server" as const };
  if (keys.claude) return { apiKey: keys.claude, provider: "claude" as const, source: "server" as const };
  return null;
}

export async function readAiSettings() {
  const fromServer = serverSettings();
  if (fromServer) return fromServer;

  const store = await cookies();
  const apiKey = store.get(KEY_COOKIE)?.value;
  const provider = providerName(store.get(PROVIDER_COOKIE)?.value);
  if (!apiKey || !provider) return null;
  return { apiKey, provider, source: "browser" as const };
}
