import type { DayActivities } from "./ai-providers";

export const INTERVALS = ["8:00-8:30", "8:30-9:00", "9:00-10:30", "11:00-12:00", "12:00-13:00"];
export const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri"];
export function validInterval(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 50;
}
export function intervalSortValue(interval: string) {
  const known = INTERVALS.indexOf(interval);
  return known === -1 ? INTERVALS.length + 1 : known;
}
export function intervalsForDay(activities: DayActivities["activitati"]) {
  return [...new Set([
    ...INTERVALS.filter(interval => activities.some(activity => activity.interval === interval)),
    ...activities.map(activity => activity.interval).filter(interval => !INTERVALS.includes(interval)),
  ])].sort((a, b) => intervalSortValue(a) - intervalSortValue(b) || a.localeCompare(b, "ro"));
}
export function validDays(value: unknown): value is DayActivities[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 5 && value.every(day =>
    day && DAYS.includes(day.ziua) && Array.isArray(day.activitati) && day.activitati.length > 0 && day.activitati.length <= 30 &&
    day.activitati.every((a: any) => a && validInterval(a.interval) && [a.lead, a.rest, a.explicatie].every(t => typeof t === "string" && t.trim().length > 0 && t.length <= 6000))
  );
}
