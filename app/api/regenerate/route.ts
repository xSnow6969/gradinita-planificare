import { NextResponse } from "next/server";
import { generateSingleDay, regenerateActivity, regenerateInterval, type DayActivities } from "@/lib/ai-providers";
import { getUsedIdeas, saveUsedIdeas } from "@/lib/history";
import { readAiSettings } from "@/lib/ai-settings";
import { DAYS, validDays, validInterval, intervalSortValue } from "@/lib/planning-validation";

export async function POST(request: Request) {
  const settings = await readAiSettings();
  if (!settings) return NextResponse.json({ error: "Configurează mai întâi cheia API în Setări AI." }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const scope = body.scope;
  const day = String(body.day || "");
  const interval = String(body.interval || "");
  const context = {
    temaAnuala: String(body.temaAnuala || "").trim(),
    temaProiect: String(body.temaProiect || "").trim(),
    temaSaptamanala: String(body.temaSaptamanala || "").trim(),
    grupa: String(body.grupa || "Grupa mijlocie (4-5 ani)").trim(),
    ideiUtilizator: String(body.ideiUtilizator || "").trim(),
    ideiFolositeAnterior: [
      ...(await getUsedIdeas()),
      ...((Array.isArray(body.zile) ? body.zile : []).flatMap((z: DayActivities) => Array.isArray(z?.activitati) ? z.activitati.map(a => a.rest) : [])),
    ],
  };

  if (!context.temaSaptamanala) return NextResponse.json({ error: "Tema săptămânală este obligatorie." }, { status: 400 });
  if (!DAYS.includes(day)) return NextResponse.json({ error: "Zi invalidă." }, { status: 400 });

  try {
    if (scope === "day") {
      const generatedDay = await generateSingleDay(settings.provider, context, settings.apiKey, day);
      generatedDay.activitati.sort((a, b) => intervalSortValue(a.interval) - intervalSortValue(b.interval));
      await saveUsedIdeas(generatedDay.activitati.map(activity => activity.rest));
      return NextResponse.json({ day: generatedDay });
    }

    if (!validInterval(interval)) return NextResponse.json({ error: "Interval invalid." }, { status: 400 });

    if (scope === "interval") {
      const existing = Array.isArray(body.activities) ? body.activities : [];
      const activities = await regenerateInterval(settings.provider, context, settings.apiKey, day, interval, existing);
      await saveUsedIdeas(activities.map(activity => activity.rest));
      return NextResponse.json({ activities });
    }

    if (scope === "activity") {
      const activity = await regenerateActivity(settings.provider, context, settings.apiKey, day, interval, body.activity || {});
      await saveUsedIdeas([activity.rest]);
      return NextResponse.json({ activity });
    }

    return NextResponse.json({ error: "Tip de regenerare invalid." }, { status: 400 });
  } catch (error: any) {
    console.error(error);
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    return NextResponse.json({
      error: error.message || "Nu am putut regenera ideea.",
      statusCode: status,
      retryAfterMs: error.retryAfterMs || 0,
      provider: settings.provider,
    }, { status });
  }
}
