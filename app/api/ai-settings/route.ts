import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { KEY_COOKIE, PROVIDER_COOKIE, readAiSettings, type AiProvider } from "@/lib/ai-settings";

function validProvider(value: unknown): value is AiProvider {
  return value === "auto" || value === "claude" || value === "gemini" || value === "groq";
}

function validApiKey(provider: AiProvider, apiKey: string) {
  if (provider === "auto") return apiKey.length <= 3000 && apiKey.split(/[\n,]/).map(key => key.trim()).filter(Boolean).every(key => /^gsk_[A-Za-z0-9_-]{20,512}$/.test(key) || /^[A-Za-z0-9_.-]{20,512}$/.test(key));
  if (provider === "claude") return /^sk-ant-[A-Za-z0-9_-]{20,512}$/.test(apiKey);
  if (provider === "groq") return apiKey.split(",").every(key => /^gsk_[A-Za-z0-9_-]{20,512}$/.test(key.trim())) && apiKey.length <= 2000 && !/\s/.test(apiKey);
  return apiKey.split(",").every(key => /^[A-Za-z0-9_.-]{20,512}$/.test(key.trim())) && apiKey.length <= 2000 && !/\s/.test(apiKey);
}

export async function GET() {
  const settings = await readAiSettings();
  return NextResponse.json({ configured: !!settings, provider: settings?.provider, source: settings?.source }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cerere nepermisă." }, { status: 403 });
  }
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Date invalide." }, { status: 400 }); }
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!validProvider(body.provider) || !validApiKey(body.provider, apiKey)) {
    return NextResponse.json({ error: "Introdu o cheie API validă pentru providerul ales." }, { status: 400 });
  }
  const response = NextResponse.json({ configured: true, provider: body.provider, source: "browser" });
  const options = { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict" as const, path: "/api", maxAge: 60 * 60 * 24 * 30 };
  response.cookies.set(KEY_COOKIE, apiKey, options);
  response.cookies.set(PROVIDER_COOKIE, body.provider, options);
  return response;
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cerere nepermisă." }, { status: 403 });
  }
  const store = await cookies();
  for (const name of [KEY_COOKIE, PROVIDER_COOKIE]) store.set(name, "", { path: "/api", maxAge: 0 });
  const settings = await readAiSettings();
  return NextResponse.json({ configured: !!settings, provider: settings?.provider, source: settings?.source });
}
