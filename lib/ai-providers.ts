import "server-only";
import { DAYS, INTERVALS, validDays } from "./planning-validation";
import type { AiProvider } from "./ai-settings";

class AiProviderError extends Error {
  constructor(message: string, readonly retryable = false, readonly statusCode = 500, readonly retryAfterMs = 1500) {
    super(message);
  }
}

let geminiKeyCursor = 0;
let groqKeyCursor = 0;

export interface DayActivities {
  ziua: string;
  activitati: {
    interval: string;
    lead: string; // ex: "ADE – DȘ 1:"
    rest: string; // ex: "„Emoțiile din jurul meu” (lectură după imagini)."
    explicatie: string; // ghid pas-cu-pas pentru educatoare
  }[];
}

function buildPrompt(params: {
  temaAnuala: string;
  temaProiect: string;
  temaSaptamanala: string;
  grupa: string;
  ideiUtilizator?: string;
  ideiFolositeAnterior: string[];
}) {
  const { temaAnuala, temaProiect, temaSaptamanala, grupa, ideiUtilizator, ideiFolositeAnterior } = params;

  return `Ești un expert în curriculumul preșcolar din România (metodologia ALA/ADP/ADE, cu categoriile DȘ, DLC, DPM, DEC, DOS, T = tranziție, MM = activitate de mișcare).

Pregătește activitățile pentru planificarea săptămânală cu următorul context:
- Tema anuală de studiu: ${temaAnuala}
- Tema proiectului: ${temaProiect}
- Tema săptămânală: ${temaSaptamanala}
- Grupa: ${grupa}
${ideiUtilizator ? `- Idei de la educatoare de inclus: ${ideiUtilizator}` : ""}

IMPORTANT: Nu folosi și nu repeta niciuna dintre aceste activități deja folosite în săptămânile anterioare:
${ideiFolositeAnterior.length ? ideiFolositeAnterior.join("; ") : "(nicio activitate anterioară înregistrată)"}

Respectă structura modelului „planificare s3.pdf”, adaptând toate ideile la tema și vârsta alese.
Pentru fiecare zi folosește intervalele, în această ordine:
8:00-8:30: ALA – Joc liber / Activitate individuală de explorare a unui subiect. Propune un joc concret ȘI o explorare individuală concretă, cu materiale și întrebări pentru copil.
8:30-9:00: ADP – Micul dejun, R – rutină/deprindere, MP – moment de poveste.
9:00-10:30: ADP – ÎD (întâlnirea de dimineață), tranziții T și două activități ADE: luni DȘ 1 și DLC; marți DȘ 2 și DPM; miercuri DPM și DEC 1; joi DLC și DȘ 2; vineri DEC și DOS.
11:00-12:00: ALA pe trei centre (Ș, JR, C, A sau B), MM – mișcare și un joc distractiv/de atenție.
12:00-13:00: ADP – masa de prânz și deprinderi specifice.
Nu inventa activități pentru pauza 10:30-11:00 care nu apare în model.
Rutinele pot reveni, dar jocurile, explorările și ideile tematice trebuie să difere de la o zi la alta.
Generează între 14 și 18 activități pentru ziua cerută, fiecare cu:
- "interval": unul dintre intervalele exacte de mai sus
- "lead": eticheta scurtă (ex: "ADE – DȘ 1: ")
- "rest": titlul activității în formatul exact „Titlul activității” (tip de activitate).
- "explicatie": ghid practic, concis, cu materiale și pași clari. Nu inventa autori sau citate.

Format obligatoriu pentru titluri: folosește ghilimele românești și tip între paranteze, de exemplu „Borcanul emoțiilor” (joc de clasificare). Nu lăsa titluri fără ghilimele.
Răspunde doar cu datele cerute, fără text suplimentar. Respectă schema JSON furnizată: "zile" conține exact ziua cerută, iar "activitati" este o listă cu 14-18 obiecte. Nu omite niciun interval din program.`;
}

function buildDayPrompt(params: Parameters<typeof buildPrompt>[0], day: string, compact = false, correction?: string) {
  const common = buildPrompt(params);
  const count = compact ? "exact 14" : "14-18";
  const focus: Record<string, string> = {
    Luni: "descoperire și denumire",
    Marți: "comparare și clasificare",
    Miercuri: "exprimare creativă",
    Joi: "cooperare și joc de rol",
    Vineri: "recapitulare și reflecție",
  };
  return `${common}

Generează ACUM doar ziua "${day}", nu toată săptămâna. Câmpul "zile" trebuie să conțină exact un singur obiect, cu "ziua": "${day}".
Pentru această zi generează ${count} activități bine explicate, acoperind obligatoriu toate cele 5 intervale. Folosește exact etichetele intervalelor din listă, fără modificări. Dă zilei o direcție distinctă: ${focus[day]}. Păstrează explicațiile practice${compact ? " și concise" : ""}.${correction ? `\n\nCorectează aceste probleme din răspunsul anterior: ${correction}` : ""}`;
}

function buildActivityPrompt(params: Parameters<typeof buildPrompt>[0], day: string, interval: string, current: Partial<DayActivities["activitati"][number]>, correction?: string) {
  return `${buildPrompt(params)}

Generează ACUM o singură activitate nouă pentru ziua "${day}" și intervalul "${interval}".
Înlocuiește ideea actuală, fără să repeți titlul ei:
- Etichetă actuală: ${current.lead || "-"}
- Titlu actual: ${current.rest || "-"}

Returnează STRICT JSON cu schema:
{"activitate":{"interval":"${interval}","lead":"Etichetă scurtă:","rest":"„Titlu concret al activității” (tip de activitate).","explicatie":"Materiale: ... Pași: ... Întrebări pentru copii: ..."}}

Toate cele patru câmpuri din "activitate" sunt obligatorii și trebuie să fie texte ne-goale.
Păstrează intervalul exact "${interval}". Activitatea trebuie să fie potrivită pentru tema săptămânii, concretă, aplicabilă la clasă și diferită de ideea actuală.${correction ? `\n\nCorectează aceste probleme din răspunsul anterior: ${correction}` : ""}`;
}

function buildIntervalPrompt(params: Parameters<typeof buildPrompt>[0], day: string, interval: string, count: number, existing: DayActivities["activitati"], correction?: string) {
  return `${buildPrompt(params)}

Generează ACUM doar activitățile pentru ziua "${day}" și intervalul "${interval}".
Înlocuiește aceste idei actuale, fără să le repeți:
${existing.map(activity => `- ${activity.lead} ${activity.rest}`).join("\n") || "-"}

Returnează STRICT JSON cu schema:
{"activitati":[{"interval":"${interval}","lead":"Etichetă scurtă:","rest":"„Titlu concret al activității” (tip de activitate).","explicatie":"Materiale: ... Pași: ... Întrebări pentru copii: ..."}]}

Generează exact ${Math.max(1, Math.min(count, 8))} activități. Toate trebuie să aibă intervalul exact "${interval}", câmpuri ne-goale, să fie concrete, în limba română și potrivite pentru tema săptămânii.${correction ? `\n\nCorectează aceste probleme din răspunsul anterior: ${correction}` : ""}`;
}

function extractJson(text: string): any {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.zile)) {
      parsed.zile = parsed.zile.map((day: any) => {
        if (!day || Array.isArray(day.activitati) || !day.activitati || typeof day.activitati !== "object") return day;
        day.activitati = Object.entries(day.activitati)
          .filter(([key, value]) => /^activitate_\d+$/.test(key) && value && typeof value === "object")
          .sort(([a], [b]) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
          .map(([, activity]) => activity);
        return day;
      });
    }
    return parsed;
  } catch {
    throw new AiProviderError("AI-ul a trimis un JSON incomplet. Reîncerc generarea acestei zile.", true, 502);
  }
}

function extractActivityJson(text: string) {
  const parsed = extractJson(text);
  const activity = parsed.activitate;
  if (!activity || typeof activity !== "object") throw new AiProviderError("AI-ul nu a returnat activitatea cerută.", true, 502);
  return activity as DayActivities["activitati"][number];
}

function extractIntervalJson(text: string) {
  const parsed = extractJson(text);
  if (!Array.isArray(parsed.activitati)) throw new AiProviderError("AI-ul nu a returnat lista de activități cerută.", true, 502);
  return parsed.activitati as DayActivities["activitati"];
}

function schemaForDay(day: string) {
  const activitySchema = {
    type: "object",
    additionalProperties: false,
    required: ["interval", "lead", "rest", "explicatie"],
    properties: {
      interval: { type: "string", enum: INTERVALS },
      lead: { type: "string" },
      rest: { type: "string" },
      explicatie: { type: "string" },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["zile"],
    properties: {
      zile: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["ziua", "activitati"],
          properties: {
            ziua: { type: "string", enum: [day] },
            activitati: {
              type: "array",
              minItems: 1,
              description: "Return 14 to 18 activity objects and cover all five required time intervals.",
              items: activitySchema,
            },
          },
        },
      },
    },
  };
}

async function providerResponseError(provider: AiProvider, response: Response) {
  const status = response.status;
  const body = await response.json().catch(() => null);
  const label = providerLabel(provider);
  if (body?.error?.code === "json_validate_failed") return new AiProviderError(`${label} nu a produs un JSON valid. Reîncercă generarea cu o cerere mai concisă.`, true, 502);
  if (status === 404) return new AiProviderError(`Modelul ${label} nu este disponibil pentru această cheie. Verifică modelul configurat și accesul contului.`, false, 502);
  if ([401, 403].includes(status)) return new AiProviderError(`Verifică cheia API ${label} și permisiunile ei în Setări AI.`, false, 401);
  if (status === 400) return new AiProviderError(`${label} a respins cererea: ${body?.error?.message || "verifică cheia API și modelul configurat."}`, false, 400);
  if (status === 429) {
    const retryAfterMs = retryAfterFromHeaders(response.headers);
    return new AiProviderError(`Limita de utilizare ${label} a fost atinsă temporar; așteaptă înainte să reîncerci.`, true, 429, retryAfterMs);
  }
  return new AiProviderError(`${label} nu a putut genera planificarea (cod ${status}).`, [408, 500, 502, 503, 504].includes(status), [408, 500, 502, 503, 504].includes(status) ? 503 : 500);
}

function retryAfterFromHeaders(headers: Headers) {
  const retryAfter = Number(headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const resetTokens = durationToMs(headers.get("x-ratelimit-reset-tokens"));
  const resetRequests = durationToMs(headers.get("x-ratelimit-reset-requests"));
  return Math.max(resetTokens, resetRequests, 5000);
}

function durationToMs(value: string | null) {
  if (!value) return 0;
  const text = value.trim().toLowerCase();
  const total = [...text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)].reduce((sum, match) => {
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount)) return sum;
    if (unit === "ms") return sum + amount;
    if (unit === "s") return sum + amount * 1000;
    if (unit === "m") return sum + amount * 60_000;
    if (unit === "h") return sum + amount * 3_600_000;
    return sum;
  }, 0);
  return Math.round(total);
}

function providerLabel(provider: AiProvider) {
  if (provider === "auto") return "Auto Groq/Gemini";
  if (provider === "gemini") return "Gemini";
  if (provider === "groq") return "Groq";
  return "Claude";
}

async function callClaude(prompt: string, apiKey: string, day: string, schema?: object): Promise<any> {
  const body: any = {
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    max_tokens: 12000,
    messages: [{ role: "user", content: prompt }],
  };
  if (schema) body.output_config = { format: { type: "json_schema", schema } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw await providerResponseError("claude", res);
  const data = await res.json();
  if (data.stop_reason === "max_tokens") throw new AiProviderError("Claude a întrerupt răspunsul. Reîncerc cu o cerere mai concisă.", true, 502);
  const textBlock = data.content?.find((b: any) => b.type === "text");
  return extractJson(textBlock?.text || "");
}

async function callGemini(prompt: string, apiKey: string): Promise<any> {
  const keys = apiKey.split(",").map(key => key.trim()).filter(Boolean);
  if (!keys.length) throw new AiProviderError("Nu există nicio cheie Gemini configurată.", false, 401);
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const start = geminiKeyCursor++ % keys.length;
  let lastError: AiProviderError | null = null;
  for (let offset = 0; offset < keys.length; offset++) {
    const key = keys[(start + offset) % keys.length];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nRăspunde STRICT cu JSON valid, fără markdown și fără text în plus.` }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
      return extractJson(text);
    }
    const error = await providerResponseError("gemini", res);
    lastError = error;
    if (![429, 500, 502, 503, 504].includes(error.statusCode) || offset === keys.length - 1) throw error;
  }
  throw lastError || new AiProviderError("Gemini nu a putut genera răspunsul.", true, 503);
}

async function callGroqWithKey(prompt: string, apiKey: string): Promise<any> {
  async function request(strictJson: boolean) {
    return fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nRăspunde STRICT cu JSON valid, fără markdown și fără text în plus.`,
          },
        ],
        temperature: 0.75,
        max_completion_tokens: 12000,
        reasoning_effort: "low",
        ...(strictJson ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(180000),
    });
  }

  let res = await request(process.env.GROQ_JSON_MODE === "true");
  if (!res.ok) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === "json_validate_failed") res = await request(false);
  }
  if (!res.ok) throw await providerResponseError("groq", res);
  const data = await res.json();
  return extractJson(data.choices?.[0]?.message?.content || "");
}

async function callGroq(prompt: string, apiKey: string): Promise<any> {
  const keys = apiKey.split(",").map(key => key.trim()).filter(Boolean);
  if (!keys.length) throw new AiProviderError("Nu există nicio cheie Groq configurată.", false, 401);
  const start = groqKeyCursor++ % keys.length;
  let lastError: AiProviderError | null = null;
  for (let offset = 0; offset < keys.length; offset++) {
    const key = keys[(start + offset) % keys.length];
    try {
      return await callGroqWithKey(prompt, key);
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      lastError = error;
      if (![429, 500, 502, 503, 504].includes(error.statusCode) || offset === keys.length - 1) throw error;
    }
  }
  throw lastError || new AiProviderError("Groq nu a putut genera răspunsul.", true, 503);
}

function parseAutoKeys(apiKey: string) {
  try {
    const parsed = JSON.parse(apiKey);
    return {
      groq: typeof parsed?.groq === "string" ? parsed.groq.trim() : "",
      gemini: typeof parsed?.gemini === "string" ? parsed.gemini.trim() : "",
    };
  } catch {
    const keys = apiKey.split(/[\n,]/).map(key => key.trim()).filter(Boolean);
    return {
      groq: keys.filter(key => key.startsWith("gsk_")).join(","),
      gemini: keys.filter(key => !key.startsWith("gsk_")).join(","),
    };
  }
}

async function callAutoProvider(prompt: string, apiKey: string, day: string, schema?: object) {
  const keys = parseAutoKeys(apiKey);
  const providers = [
    keys.groq ? { provider: "groq" as const, apiKey: keys.groq } : null,
    keys.gemini ? { provider: "gemini" as const, apiKey: keys.gemini } : null,
  ].filter(Boolean) as { provider: "groq" | "gemini"; apiKey: string }[];
  if (!providers.length) throw new AiProviderError("Nu există chei Groq sau Gemini configurate pentru modul Auto.", false, 401);

  const errors: AiProviderError[] = [];
  for (const candidate of providers) {
    try {
      return await callProvider(candidate.provider, prompt, candidate.apiKey, day, schema);
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      errors.push(error);
      if (![429, 500, 502, 503, 504].includes(error.statusCode)) throw error;
    }
  }

  const limited = errors.filter(error => error.statusCode === 429);
  if (limited.length) {
    const retryAfterMs = Math.max(...limited.map(error => error.retryAfterMs || 5000));
    throw new AiProviderError("Groq și Gemini free sunt temporar limitate; așteaptă înainte să reîncerci.", true, 429, retryAfterMs);
  }
  const last = errors.at(-1);
  throw last || new AiProviderError("Groq și Gemini nu au putut genera răspunsul.", true, 503);
}

async function callProvider(provider: AiProvider, prompt: string, apiKey: string, day: string, schema?: object) {
  if (provider === "auto") return callAutoProvider(prompt, apiKey, day, schema);
  if (provider === "gemini") return callGemini(prompt, apiKey);
  if (provider === "groq") return callGroq(prompt, apiKey);
  return callClaude(prompt, apiKey, day, schema);
}

export async function suggestPlanningField(
  provider: AiProvider,
  apiKey: string,
  field: "temaAnuala" | "temaProiect" | "temaSaptamanala" | "ideiUtilizator",
  context: {
    temaAnuala?: string;
    temaProiect?: string;
    temaSaptamanala?: string;
    grupa?: string;
    ideiUtilizator?: string;
  }
) {
  const labels: Record<typeof field, string> = {
    temaAnuala: "Tema anuală de studiu",
    temaProiect: "Tema proiectului",
    temaSaptamanala: "Tema săptămânală",
    ideiUtilizator: "Idei proprii pentru activități",
  };
  const dependencyRules: Record<typeof field, string> = {
    temaAnuala: "Alege teme anuale largi, potrivite curriculumului preșcolar. Nu depinde de celelalte câmpuri.",
    temaProiect: `Propune teme de proiect care decurg direct din Tema anuală de studiu: "${context.temaAnuala || "(necompletată)"}". Dacă tema anuală lipsește, alege proiecte generale, dar spune-le ca titluri concrete.`,
    temaSaptamanala: `Propune teme săptămânale care decurg clar din Tema anuală de studiu: "${context.temaAnuala || "(necompletată)"}" și Tema proiectului: "${context.temaProiect || "(necompletată)"}". Tema săptămânală trebuie să fie mai îngustă, aplicabilă într-o singură săptămână, nu o temă mare de proiect.`,
    ideiUtilizator: `Propune idei practice care se potrivesc cu Tema anuală: "${context.temaAnuala || "(necompletată)"}", Tema proiectului: "${context.temaProiect || "(necompletată)"}" și Tema săptămânală: "${context.temaSaptamanala || "(necompletată)"}".`,
  };
  const prompt = `Ești un consilier pedagogic pentru grădiniță. Generează 3 variante scurte, naturale și utile pentru câmpul "${labels[field]}".

Context curent:
- Tema anuală de studiu: ${context.temaAnuala || "(necompletată)"}
- Tema proiectului: ${context.temaProiect || "(necompletată)"}
- Tema săptămânală: ${context.temaSaptamanala || "(necompletată)"}
- Grupa: ${context.grupa || "Grupa mijlocie (4-5 ani)"}
- Idei proprii: ${context.ideiUtilizator || "(necompletate)"}

Reguli:
- Completează doar câmpul cerut, nu rescrie toate câmpurile.
- Respectă dependența pedagogică dintre câmpuri: tema anuală este cea mai largă, tema proiectului o restrânge, tema săptămânală este derivată din primele două.
- Regula specifică pentru câmpul cerut: ${dependencyRules[field]}
- Variantele trebuie să fie în română, concrete și potrivite pentru preșcolari.
- Pentru "Idei proprii", scrie idei practice scurte, nu titluri oficiale.

Răspunde STRICT JSON:
{"suggestions":["variantă 1","variantă 2","variantă 3"]}`;
  const result = await callProvider(provider, prompt, apiKey, "Luni");
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
  return suggestions.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 3);
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateIdeas(
  provider: AiProvider,
  params: {
    temaAnuala: string;
    temaProiect: string;
    temaSaptamanala: string;
    grupa: string;
    ideiUtilizator?: string;
    ideiFolositeAnterior: string[];
    zileSelectate?: string[];
  },
  apiKey: string,
  onProgress: (day: string, index: number, status: "started" | "retry" | "completed" | "limited", retryAfterMs?: number) => void = () => {}
): Promise<{ zile: DayActivities[] }> {
  const generationDays = (params.zileSelectate?.length ? params.zileSelectate : DAYS).filter(day => DAYS.includes(day));
  if (!generationDays.length) throw new Error("Alege cel puțin o zi pentru generare.");

  if (provider === "gemini" || provider === "auto") {
    const zile: DayActivities[] = [];
    for (const [index, day] of generationDays.entries()) {
      zile.push(await generateSingleDay(provider, params, apiKey, day, index, onProgress));
      if (index < generationDays.length - 1) await wait(provider === "gemini" ? 2500 : 1200);
    }
    return { zile };
  }

  const results = await Promise.allSettled(generationDays.map((day, index) => generateSingleDay(provider, params, apiKey, day, index, onProgress)));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
  return { zile: results.map(result => (result as PromiseFulfilledResult<DayActivities>).value) };
}

export async function generateSingleDay(
  provider: AiProvider,
  params: Parameters<typeof buildPrompt>[0],
  apiKey: string,
  day: string,
  index = DAYS.indexOf(day),
  onProgress: (day: string, index: number, status: "started" | "retry" | "completed" | "limited", retryAfterMs?: number) => void = () => {}
) {
  onProgress(day, index, "started");
  let result: any;
  let generatedDay: DayActivities | undefined;
  let problem = "";
  const maxAttempts = provider === "gemini" || provider === "auto" ? 4 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) onProgress(day, index, "retry");
    try {
      result = await callProvider(provider, buildDayPrompt(params, day, attempt > 0, problem || undefined), apiKey, day, schemaForDay(day));
    } catch (error) {
      if (attempt < maxAttempts - 1 && error instanceof AiProviderError && error.retryable) {
        problem = error.message;
        if (error.statusCode === 429) {
          const waitMs = Math.max(error.retryAfterMs, provider === "gemini" || provider === "auto" ? 12000 : 1500);
          onProgress(day, index, "limited", waitMs);
          await wait(waitMs);
        }
        else await wait(provider === "gemini" || provider === "auto" ? 4000 : 1500);
        continue;
      }
      throw error;
    }

    generatedDay = result.zile?.find((candidate: DayActivities) => normalizeValue(candidate.ziua) === normalizeValue(day));
    if (generatedDay && Array.isArray(generatedDay.activitati)) {
      generatedDay.ziua = day;
      for (const activity of generatedDay.activitati) {
        const canonicalInterval = INTERVALS.find(interval => normalizeValue(interval) === normalizeValue(activity.interval));
        if (canonicalInterval) activity.interval = canonicalInterval;
      }
    }
    problem = dayProblem(generatedDay);
    if (!problem) {
      onProgress(day, index, "completed");
      return generatedDay;
    }
  }
  throw new Error(`Planificarea pentru ${day} este incompletă: ${problem || "AI-ul nu a returnat ziua."}`);
}

export async function regenerateActivity(
  provider: AiProvider,
  params: Parameters<typeof buildPrompt>[0],
  apiKey: string,
  day: string,
  interval: string,
  current: Partial<DayActivities["activitati"][number]>
) {
  let problem = "";
  const maxAttempts = provider === "claude" ? 2 : 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await callProvider(provider, buildActivityPrompt(params, day, interval, current, problem || undefined), apiKey, day);
      const activity = normalizeActivity(extractActivityJson(JSON.stringify(result)), interval);
      const issue = activityProblem(activity);
      if (!issue) return activity;
      problem = issue;
    } catch (error) {
      if (attempt < maxAttempts - 1 && error instanceof AiProviderError && error.retryable) {
        problem = error.message;
        await wait(error.statusCode === 429 ? Math.max(error.retryAfterMs, 9000) : 2500);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Activitatea nouă este incompletă: ${problem || "AI-ul nu a returnat activitatea."}`);
}

export async function regenerateInterval(
  provider: AiProvider,
  params: Parameters<typeof buildPrompt>[0],
  apiKey: string,
  day: string,
  interval: string,
  existing: DayActivities["activitati"]
) {
  let problem = "";
  const maxAttempts = provider === "claude" ? 2 : 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await callProvider(provider, buildIntervalPrompt(params, day, interval, existing.length || 1, existing, problem || undefined), apiKey, day);
      const activities = extractIntervalJson(JSON.stringify(result)).map(activity => normalizeActivity(activity, interval));
      const issue = activities.length ? activities.map(activityProblem).find(Boolean) : "nu a returnat activități";
      if (!issue) return activities;
      problem = issue;
    } catch (error) {
      if (attempt < maxAttempts - 1 && error instanceof AiProviderError && error.retryable) {
        problem = error.message;
        await wait(error.statusCode === 429 ? Math.max(error.retryAfterMs, 9000) : 2500);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Intervalul nou este incomplet: ${problem || "AI-ul nu a returnat intervalul."}`);
}

function normalizeValue(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, "").toLocaleLowerCase("ro");
}

function dayProblem(day: DayActivities | undefined) {
  if (!day || !Array.isArray(day.activitati)) return "AI-ul nu a returnat activitățile zilei.";
  if (!validDays([day])) return "unul sau mai multe câmpuri de activitate sunt goale ori invalide";
  if (day.activitati.length < 14 || day.activitati.length > 18) return `au fost returnate ${day.activitati.length} activități, dar sunt necesare între 14 și 18`;
  const missingIntervals = INTERVALS.filter(interval => !day.activitati.some(activity => normalizeValue(activity.interval) === normalizeValue(interval)));
  if (missingIntervals.length) return `lipsesc intervalele ${missingIntervals.join(", ")}`;
  return "";
}

function normalizeActivity(activity: any, interval: string): DayActivities["activitati"][number] {
  return {
    interval,
    lead: String(activity?.lead || activity?.eticheta || activity?.categorie || activity?.tip || "").trim(),
    rest: String(activity?.rest || activity?.titlu || activity?.title || activity?.nume || "").trim(),
    explicatie: String(activity?.explicatie || activity?.descriere || activity?.ghid || activity?.materiale_si_pasi || "").trim(),
  };
}

function activityProblem(activity: DayActivities["activitati"][number] | undefined) {
  if (!activity) return "lipsește activitatea";
  const missing = (["interval", "lead", "rest", "explicatie"] as const).filter(field => typeof activity[field] !== "string" || activity[field].trim().length === 0);
  if (missing.length) return `câmpuri goale: ${missing.join(", ")}. Completează obligatoriu fiecare câmp cu text concret`;
  if (activity.interval.length > 50 || activity.lead.length > 6000 || activity.rest.length > 6000 || activity.explicatie.length > 6000) return "unul sau mai multe câmpuri sunt prea lungi";
  return "";
}
