import { NextResponse } from "next/server";
import { readAiSettings } from "@/lib/ai-settings";
import { suggestPlanningField } from "@/lib/ai-providers";

const FIELDS = ["temaAnuala", "temaProiect", "temaSaptamanala", "ideiUtilizator"] as const;

export async function POST(request: Request) {
  const settings = await readAiSettings();
  if (!settings) return NextResponse.json({ error: "Configurează mai întâi cheia API în Setări AI." }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  if (!FIELDS.includes(body.field)) {
    return NextResponse.json({ error: "Câmp invalid pentru sugestii." }, { status: 400 });
  }

  try {
    const suggestions = await suggestPlanningField(settings.provider, settings.apiKey, body.field, {
      temaAnuala: String(body.temaAnuala || "").trim(),
      temaProiect: String(body.temaProiect || "").trim(),
      temaSaptamanala: String(body.temaSaptamanala || "").trim(),
      grupa: String(body.grupa || "").trim(),
      ideiUtilizator: String(body.ideiUtilizator || "").trim(),
    });
    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error(error);
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    return NextResponse.json({
      error: error.message || "Nu am putut genera sugestii.",
      statusCode: status,
      retryAfterMs: error.retryAfterMs || 0,
      provider: settings.provider,
    }, { status });
  }
}
