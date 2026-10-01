import { NextResponse } from "next/server";
import { generateIdeas } from "@/lib/ai-providers";
import { getUsedIdeas, saveUsedIdeas } from "@/lib/history";
import { readAiSettings } from "@/lib/ai-settings";
import { validDays, DAYS, INTERVALS, intervalSortValue } from "@/lib/planning-validation";

export async function POST(request: Request) {
  const settings = await readAiSettings();
  if (!settings) return NextResponse.json({ error: "Configurează mai întâi cheia API în Setări AI." }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  const { temaAnuala, temaProiect, temaSaptamanala, grupa, ideiUtilizator } = body;
  const zileSelectate = Array.isArray(body.zileSelectate)
    ? body.zileSelectate.filter((day: unknown) => typeof day === "string" && DAYS.includes(day))
    : DAYS;
  if (!temaSaptamanala || typeof temaSaptamanala !== "string") {
    return NextResponse.json({ error: "Tema săptămânală este obligatorie." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const ideiFolositeAnterior = await getUsedIdeas();
        const result = await generateIdeas(settings.provider, {
          temaAnuala: String(temaAnuala || "").trim(),
          temaProiect: String(temaProiect || "").trim(),
          temaSaptamanala: temaSaptamanala.trim(),
          grupa: String(grupa || "Grupa mijlocie (4-5 ani)").trim(),
          ideiUtilizator: String(ideiUtilizator || "").trim(),
          ideiFolositeAnterior,
          zileSelectate,
        }, settings.apiKey, (day, index, status, retryAfterMs) => send({
          type: "progress",
          day,
          index,
          status,
          retryAfterMs: retryAfterMs || 0,
          statusCode: status === "limited" ? 429 : undefined,
          provider: settings.provider,
          error: status === "limited" ? `Limita de utilizare ${providerDisplayName(settings.provider)} a fost atinsă temporar; aștept timpul indicat de API.` : undefined,
        }));

        if (!validDays(result.zile) || result.zile.length !== zileSelectate.length || !zileSelectate.every(day => result.zile.some(z => z.ziua === day)) || !result.zile.every(z => INTERVALS.every(interval => z.activitati.some(a => a.interval === interval)))) {
          const invalid = result.zile.filter(day => !validDays([day])).map(day => day.ziua);
          const missing = result.zile.flatMap(day => INTERVALS.filter(interval => !day.activitati.some(activity => activity.interval === interval)).map(interval => `${day.ziua}: ${interval}`));
          throw new Error(`Planul nu a trecut verificarea${invalid.length ? ` pentru ${invalid.join(", ")}` : ""}${missing.length ? `. Lipsesc intervalele ${missing.join(", ")}` : ". Numărul de zile sau activități nu este complet."}`);
        }
        result.zile.sort((a, b) => DAYS.indexOf(a.ziua) - DAYS.indexOf(b.ziua));
        for (const day of result.zile) day.activitati.sort((a, b) => intervalSortValue(a.interval) - intervalSortValue(b.interval) || a.interval.localeCompare(b.interval, "ro"));
        await saveUsedIdeas(result.zile.flatMap((z) => z.activitati.map((a) => a.rest)));
        send({ type: "result", zile: result.zile });
      } catch (error: any) {
        console.error(error);
        send({
          type: "error",
          error: error.message || "Eroare la generarea planificării. Verifică cheia API configurată.",
          statusCode: error.statusCode || 500,
          retryAfterMs: error.retryAfterMs || 0,
          provider: settings.provider,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function providerDisplayName(provider: string) {
  if (provider === "auto") return "Groq/Gemini";
  if (provider === "groq") return "Groq";
  if (provider === "gemini") return "Gemini";
  return "Claude";
}
