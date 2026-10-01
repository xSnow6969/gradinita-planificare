import type { DayActivities } from "./ai-providers";

export function normalizeActivityTitle(value: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const withoutFinalDot = text.replace(/[.。]+$/u, "");
  const quoted = /^["„”]/u.test(withoutFinalDot)
    ? withoutFinalDot.replace(/^["”]/u, "„").replace(/"([^"]*)$/u, "”$1")
    : `„${withoutFinalDot.replace(/\s*\([^)]*\)\s*$/u, "").trim()}”${kindFromTitle(withoutFinalDot)}`;
  return /[.!?]$/u.test(quoted) ? quoted : `${quoted}.`;
}

export function activityBadge(lead: string) {
  const clean = lead.trim();
  const match = clean.match(/^(ALA|ADP|ADE|DȘ|DLC|DPM|DEC|DOS|MM|T|R|MP|JOC|Ș|JR|C|A|B)/iu);
  return match?.[1]?.toUpperCase() || "ACT";
}

export function dayShortGuide(day: DayActivities, theme: string) {
  const intervals = [...new Set(day.activitati.map(activity => activity.interval))].join(", ");
  const materials = inferMaterials(day);
  const focus = inferFocus(day);
  return `Pe scurt: pentru ${day.ziua}, pregătește ${materials}. Păstrează ritmul pe intervalele ${intervals}, cu tranziții scurte între momente. Accentul zilei este ${focus}${theme ? `, în legătură cu tema „${theme}”` : ""}.`;
}

function kindFromTitle(value: string) {
  const match = value.match(/\(([^)]{2,80})\)\s*$/u);
  return match ? ` (${match[1].trim()})` : " (activitate practică)";
}

function inferMaterials(day: DayActivities) {
  const text = day.activitati.map(activity => `${activity.rest} ${activity.explicatie}`).join(" ").toLocaleLowerCase("ro");
  const found = [
    ["fișe de lucru", /fiș|foaie|coli|hârtie|hartie/u],
    ["cartonașe", /cartonaș|cartonas|card/u],
    ["materiale de decupat și lipit", /decup|lipici|foarfec|colaj/u],
    ["imagini sau planșe", /imagin|planș|plansa|fotograf/u],
    ["obiecte pentru sortare", /sort|cub|jetoane|bile|obiect/u],
  ].filter(([, pattern]) => (pattern as RegExp).test(text)).map(([label]) => label);
  return found.length ? found.slice(0, 3).join(", ") : "materialele simple pentru activitățile propuse";
}

function inferFocus(day: DayActivities) {
  const text = day.activitati.map(activity => `${activity.lead} ${activity.rest}`).join(" ").toLocaleLowerCase("ro");
  if (/emoț|emot/u.test(text)) return "pe recunoaștere, exprimare și reglare emoțională";
  if (/număr|numar|sort|clasific/u.test(text)) return "pe numărare, sortare și observare atentă";
  if (/culo/u.test(text)) return "pe recunoașterea culorilor și exprimare prin joc";
  if (/poveste|lectur|imagin/u.test(text)) return "pe comunicare, ascultare și povestire";
  return "pe participare, conversație și lucru practic cu copiii";
}
