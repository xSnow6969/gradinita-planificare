"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DayActivities } from "@/lib/ai-providers";
import AiSettings from "./ai-settings";
import DocumentPreview from "./document-preview";
import { DAYS, INTERVALS, intervalSortValue, intervalsForDay, validDays } from "@/lib/planning-validation";
import { activityBadge, normalizeActivityTitle } from "@/lib/activity-format";

const GRUPE = ["Grupa mică (3-4 ani)", "Grupa mijlocie (4-5 ani)", "Grupa mare (5-6 ani)", "Grupa pregătitoare (6-7 ani)"];
const THEME_MODES = [
  { value: "white", label: "White" },
  { value: "pink", label: "Pink" },
  { value: "dark", label: "Dark" },
] as const;
type ActivityField = "lead" | "rest" | "explicatie" | "interval";
type AgendaField = "obiectiv" | "materiale" | "notite";
type PlanningField = "temaAnuala" | "temaProiect" | "temaSaptamanala" | "ideiUtilizator";
type ThemeMode = typeof THEME_MODES[number]["value"];
type SavedPlanData = {
  temaAnuala: string;
  temaProiect: string;
  temaSaptamanala: string;
  saptamana: string;
  grupa: string;
  ideiUtilizator: string;
  zile: DayActivities[];
  selectedDays: string[];
};
type SavedPlan = {
  id: string;
  savedAt: string;
  title: string;
  data: SavedPlanData;
};
type RateLimitState = {
  message: string;
  retryAfterMs: number;
  until: number;
  provider?: string;
};
const HISTORY_KEY = "planning-history-v1";
const HISTORY_LIMIT = 10;

export default function Dashboard() {
  const router = useRouter();
  const [aiReady, setAiReady] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("white");

  const [temaAnuala, setTemaAnuala] = useState("");
  const [temaProiect, setTemaProiect] = useState("");
  const [temaSaptamanala, setTemaSaptamanala] = useState("");
  const [saptamana, setSaptamana] = useState("Săptămâna 1");
  const [grupa, setGrupa] = useState(GRUPE[1]);
  const [ideiUtilizator, setIdeiUtilizator] = useState("");

  const [zile, setZile] = useState<DayActivities[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ completed: string[]; active: { day: string; index: number; retry: boolean }[] } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>(DAYS);
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const [busyAction, setBusyAction] = useState("");
  const [busySuggestion, setBusySuggestion] = useState<PlanningField | "">("");
  const [fieldSuggestions, setFieldSuggestions] = useState<Partial<Record<PlanningField, string[]>>>({});
  const [rateLimit, setRateLimit] = useState<RateLimitState | null>(null);
  const [rateLimitClock, setRateLimitClock] = useState(Date.now());
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("planning-theme");
    if (saved === "white" || saved === "pink" || saved === "dark") setThemeMode(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem("planning-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("planning-draft-v1") || "null");
      if (saved && validDays(saved.zile) && [saved.temaAnuala, saved.temaProiect, saved.temaSaptamanala, saved.saptamana, saved.grupa, saved.ideiUtilizator].every(value => typeof value === "string")) {
        setTemaAnuala(saved.temaAnuala); setTemaProiect(saved.temaProiect); setTemaSaptamanala(saved.temaSaptamanala);
        setSaptamana(saved.saptamana); setGrupa(saved.grupa); setIdeiUtilizator(saved.ideiUtilizator); setZile(saved.zile);
        setSelectedDays(saved.selectedDays?.filter((day: string) => DAYS.includes(day)) || saved.zile.map((day: DayActivities) => day.ziua));
        setOpenDays(Object.fromEntries(saved.zile.map((day: DayActivities) => [day.ziua, false])));
        setDraftStatus("Planificarea salvată în acest browser a fost restaurată.");
      }
    } catch { setDraftStatus("Planificarea locală nu a putut fi restaurată."); }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (!Array.isArray(saved)) return;
      setSavedPlans(saved.filter(isSavedPlan).slice(0, HISTORY_LIMIT));
    } catch {
      setSavedPlans([]);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded || !zile) return;
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem("planning-draft-v1", JSON.stringify({ temaAnuala, temaProiect, temaSaptamanala, saptamana, grupa, ideiUtilizator, zile, selectedDays }));
        setDraftStatus("Planificare salvată automat în acest browser.");
      } catch { setDraftStatus("Salvarea locală nu este disponibilă. Descarcă documentele pentru a le păstra."); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [draftLoaded, temaAnuala, temaProiect, temaSaptamanala, saptamana, grupa, ideiUtilizator, zile, selectedDays]);

  const totalActivitati = useMemo(
    () => zile?.reduce((total, zi) => total + zi.activitati.length, 0) || 0,
    [zile]
  );
  const rateLimitRemainingMs = rateLimit ? Math.max(0, rateLimit.until - rateLimitClock) : 0;
  const isRateLimited = rateLimitRemainingMs > 0;
  const rateLimitProgress = rateLimit ? Math.max(0, Math.min(100, (rateLimitRemainingMs / Math.max(rateLimit.retryAfterMs, 1)) * 100)) : 0;

  useEffect(() => {
    if (!rateLimit) return;
    const now = Date.now();
    setRateLimitClock(now);
    if (rateLimit.until <= now) {
      setRateLimit(null);
      return;
    }
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setRateLimitClock(tick);
      if (tick >= rateLimit.until) setRateLimit(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rateLimit]);

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  function registerRateLimit(data: any) {
    const retryAfterMs = Number(data?.retryAfterMs || 0);
    if (data?.statusCode !== 429 && retryAfterMs <= 0) return false;
    const waitMs = retryAfterMs > 0 ? retryAfterMs : 5000;
    const now = Date.now();
    setRateLimitClock(now);
    setRateLimit({
      message: data?.error || "Limita de utilizare AI a fost atinsă temporar.",
      retryAfterMs: waitMs,
      until: now + waitMs,
      provider: typeof data?.provider === "string" ? data.provider : undefined,
    });
    return true;
  }

  async function handleGenerate() {
    if (!temaSaptamanala.trim()) {
      setError("Completează tema săptămânală înainte de generare.");
      return;
    }
    if (!selectedDays.length) {
      setError("Alege cel puțin o zi pentru generare.");
      return;
    }
    if (isRateLimited) {
      setError(`Așteaptă ${formatWait(rateLimitRemainingMs)} înainte de următoarea cerere AI.`);
      return;
    }

    setLoading(true);
    setGenerationProgress(null);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temaAnuala: temaAnuala.trim(),
          temaProiect: temaProiect.trim(),
          temaSaptamanala: temaSaptamanala.trim(),
          grupa,
          ideiUtilizator: ideiUtilizator.trim(),
          zileSelectate: selectedDays,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        registerRateLimit(data);
        throw new Error(data.error || "Eroare necunoscută.");
      }
      if (!res.body || !res.headers.get("Content-Type")?.includes("application/x-ndjson")) {
        throw new Error("Răspunsul serverului nu a putut fi citit. Reîncarcă pagina și încearcă din nou.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let generated: DayActivities[] | null = null;
      const readEvent = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "progress") {
          if (event.status === "limited") registerRateLimit(event);
          setGenerationProgress(current => {
            const completed = current?.completed || [];
            const active = current?.active.filter(item => item.day !== event.day) || [];
            if (event.status === "completed") return { completed: [...new Set([...completed, event.day])], active };
            return { completed, active: [...active, { day: event.day, index: event.index, retry: event.status === "retry" || event.status === "limited" }] };
          });
        }
        if (event.type === "error") {
          registerRateLimit(event);
          throw new Error(event.error);
        }
        if (event.type === "result") generated = event.zile;
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        lines.forEach(readEvent);
        if (done) break;
      }
      if (buffer.trim()) readEvent(buffer);
      if (!generated) throw new Error("AI-ul nu a trimis planificarea completă. Încearcă din nou.");
      setZile(generated);
      setOpenDays(Object.fromEntries(generated.map(day => [day.ziua, false])));
      setMessage("Planificarea a fost generată. Poți edita activitățile înainte de descărcare.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setGenerationProgress(null);
    }
  }

  function updateActivity(dayIndex: number, activityIndex: number, field: ActivityField, value: string) {
    setZile((current) => {
      if (!current) return current;
      return current.map((zi, ziIndex) => {
        if (ziIndex !== dayIndex) return zi;
        return {
          ...zi,
          activitati: zi.activitati.map((activitate, actIndex) =>
            actIndex === activityIndex ? { ...activitate, [field]: value } : activitate
          ),
        };
      });
    });
  }

  function updateDayAgenda(dayIndex: number, field: AgendaField, value: string) {
    setZile((current) => {
      if (!current) return current;
      return current.map((zi, ziIndex) =>
        ziIndex === dayIndex
          ? { ...zi, agenda: { ...(zi.agenda || {}), [field]: value } }
          : zi
      );
    });
  }

  function removeActivity(dayIndex: number, activityIndex: number) {
    setZile((current) => {
      if (!current) return current;
      return current.map((zi, ziIndex) =>
        ziIndex === dayIndex
          ? { ...zi, activitati: zi.activitati.filter((_, actIndex) => actIndex !== activityIndex) }
          : zi
      );
    });
  }

  function toggleSelectedDay(day: string) {
    setSelectedDays(current => {
      const next = current.includes(day) ? current.filter(item => item !== day) : [...current, day].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
      return next.length ? next : current;
    });
  }

  function toggleOpenDay(day: string) {
    setOpenDays(current => ({ ...current, [day]: !(current[day] ?? false) }));
  }

  function contextPayload() {
    return {
      temaAnuala: temaAnuala.trim(),
      temaProiect: temaProiect.trim(),
      temaSaptamanala: temaSaptamanala.trim(),
      grupa,
      ideiUtilizator: ideiUtilizator.trim(),
      zile,
    };
  }

  function currentPlanData(): SavedPlanData | null {
    if (!zile) return null;
    return { temaAnuala, temaProiect, temaSaptamanala, saptamana, grupa, ideiUtilizator, zile, selectedDays };
  }

  function persistHistory(next: SavedPlan[]) {
    const trimmed = next.slice(0, HISTORY_LIMIT);
    setSavedPlans(trimmed);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  }

  function saveCurrentPlan() {
    const data = currentPlanData();
    if (!data) return;
    const savedAt = new Date().toISOString();
    const title = `${temaSaptamanala.trim() || "Planificare"} · ${saptamana.trim() || "Săptămână"}`;
    const item: SavedPlan = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
      savedAt,
      title,
      data,
    };
    persistHistory([item, ...savedPlans]);
    setDraftStatus("Planificarea a fost salvată în istoric.");
  }

  function loadSavedPlan(plan: SavedPlan) {
    setTemaAnuala(plan.data.temaAnuala);
    setTemaProiect(plan.data.temaProiect);
    setTemaSaptamanala(plan.data.temaSaptamanala);
    setSaptamana(plan.data.saptamana);
    setGrupa(plan.data.grupa);
    setIdeiUtilizator(plan.data.ideiUtilizator);
    setZile(plan.data.zile);
    const pickedDays = plan.data.selectedDays.filter(day => DAYS.includes(day));
    setSelectedDays(pickedDays.length ? pickedDays : plan.data.zile.map(day => day.ziua));
    setOpenDays(Object.fromEntries(plan.data.zile.map(day => [day.ziua, false])));
    setMessage(`Am încărcat "${plan.title}" din istoric.`);
    setError("");
  }

  function deleteSavedPlan(id: string) {
    persistHistory(savedPlans.filter(plan => plan.id !== id));
  }

  async function suggestField(field: PlanningField) {
    if (isRateLimited) {
      setError(`Așteaptă ${formatWait(rateLimitRemainingMs)} înainte de următoarea sugestie.`);
      return;
    }
    setBusySuggestion(field);
    setError("");
    try {
      const res = await fetch("/api/suggest-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...contextPayload(), field }),
      });
      const data = await res.json();
      if (!res.ok) {
        registerRateLimit(data);
        throw new Error(data.error || "Nu am putut genera sugestii.");
      }
      setFieldSuggestions(current => ({ ...current, [field]: data.suggestions || [] }));
    } catch (error: any) {
      setError(error.message || "Sugestiile nu au putut fi generate.");
    } finally {
      setBusySuggestion("");
    }
  }

  function applySuggestion(field: PlanningField, value: string) {
    const setters: Record<PlanningField, (value: string) => void> = {
      temaAnuala: setTemaAnuala,
      temaProiect: setTemaProiect,
      temaSaptamanala: setTemaSaptamanala,
      ideiUtilizator: setIdeiUtilizator,
    };
    setters[field](value);
    setFieldSuggestions(current => ({ ...current, [field]: [] }));
  }

  async function regenerate(scope: "activity" | "interval" | "day", dayIndex: number, activityIndex?: number, interval?: string) {
    if (!zile) return;
    if (isRateLimited) {
      setError(`Așteaptă ${formatWait(rateLimitRemainingMs)} înainte de următoarea regenerare.`);
      return;
    }
    const day = zile[dayIndex];
    const targetInterval = interval || (typeof activityIndex === "number" ? day.activitati[activityIndex]?.interval : "");
    const actionKey = `${scope}-${day.ziua}-${targetInterval}-${activityIndex ?? "all"}`;
    setBusyAction(actionKey);
    setError("");
    setMessage("");
    try {
      const body = {
        ...contextPayload(),
        scope,
        day: day.ziua,
        interval: targetInterval,
        activity: typeof activityIndex === "number" ? day.activitati[activityIndex] : undefined,
        activities: targetInterval ? day.activitati.filter(activity => activity.interval === targetInterval) : undefined,
      };
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        registerRateLimit(data);
        throw new Error(data.error || "Nu am putut regenera ideea.");
      }

      setZile(current => {
        if (!current) return current;
        return current.map((zi, ziIndex) => {
          if (ziIndex !== dayIndex) return zi;
          if (scope === "day") return { ...data.day, agenda: zi.agenda };
          if (scope === "interval") {
            return {
              ...zi,
              activitati: [
                ...zi.activitati.filter(activity => activity.interval !== targetInterval),
                ...data.activities,
              ].sort((a, b) => intervalSortValue(a.interval) - intervalSortValue(b.interval) || a.interval.localeCompare(b.interval, "ro")),
            };
          }
          if (typeof activityIndex !== "number") return zi;
          return {
            ...zi,
            activitati: zi.activitati.map((activity, actIndex) => actIndex === activityIndex ? data.activity : activity),
          };
        });
      });
      if (scope === "day") setOpenDays(current => ({ ...current, [day.ziua]: true }));
      setMessage(scope === "day" ? `${day.ziua} a fost regenerată.` : scope === "interval" ? `Intervalul ${targetInterval} a primit idei noi.` : "Activitatea a primit o idee nouă.");
    } catch (error: any) {
      setError(error.message || "Regenerarea a eșuat.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">✿</span><div><p className="eyebrow">SPAȚIU DE LUCRU</p><h1>Planificare Grădiniță</h1></div></div>
        <ThemeModeSwitcher value={themeMode} onChange={setThemeMode} />
        <button onClick={handleLogout} style={styles.linkBtn}>Ieși din cont</button>
      </header>

      <section className="workspace-intro"><div><p className="eyebrow">PLANIFICARE SĂPTĂMÂNALĂ</p><h2>O săptămână bine pregătită<br className="desktop-break" /> începe cu o idee.</h2><p>Adună temele, adaptează activitățile și pregătește documentele pentru grupă.</p><a className="example-download" href="/api/example-docx">Descarcă exemplul Word</a></div><div className="week-stamp day-picker" aria-label="Alege zilele pentru generare">{DAYS.map(day => <button key={day} type="button" className={selectedDays.includes(day) ? "selected" : ""} onClick={() => toggleSelectedDay(day)}>{day.slice(0, 2)}</button>)}</div></section>

      <AiSettings onReady={setAiReady} variant="hidden" />

      <PlanningHistory
        plans={savedPlans}
        canSave={!!zile}
        onSave={saveCurrentPlan}
        onLoad={loadSavedPlan}
        onDelete={deleteSavedPlan}
      />

      <section className="form-section">
        <div className="section-heading"><span className="step-number">01</span><div><h2>Planificarea săptămânii</h2><p>Completează contextul grupei și al temei.</p></div></div>
        <div style={styles.grid2}>
          <Field label="Tema anuală de studiu" field="temaAnuala" value={temaAnuala} onChange={setTemaAnuala} placeholder="ex: Cu ce și cum exprimăm ceea ce simțim?" onSuggest={suggestField} busy={busySuggestion === "temaAnuala"} rateLimited={isRateLimited} suggestions={fieldSuggestions.temaAnuala} onUse={applySuggestion} />
          <Field label="Tema proiectului" field="temaProiect" value={temaProiect} onChange={setTemaProiect} placeholder="ex: Lumea emoțiilor" onSuggest={suggestField} busy={busySuggestion === "temaProiect"} rateLimited={isRateLimited} suggestions={fieldSuggestions.temaProiect} onUse={applySuggestion} />
          <Field label="Tema săptămânală" field="temaSaptamanala" value={temaSaptamanala} onChange={setTemaSaptamanala} placeholder="ex: Emoțiile mele" onSuggest={suggestField} busy={busySuggestion === "temaSaptamanala"} rateLimited={isRateLimited} suggestions={fieldSuggestions.temaSaptamanala} onUse={applySuggestion} />
          <Field label="Săptămâna" value={saptamana} onChange={setSaptamana} placeholder="ex: Săptămâna 5" />
        </div>

        <label style={styles.label}>Grupa</label>
        <select style={styles.input} value={grupa} onChange={(e) => setGrupa(e.target.value)}>
          {GRUPE.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <Field
          label="Idei proprii (opțional)"
          field="ideiUtilizator"
          value={ideiUtilizator}
          onChange={setIdeiUtilizator}
          placeholder="ex: vreau o activitate cu măști de emoții și un cântec despre bucurie"
          multiline
          onSuggest={suggestField}
          busy={busySuggestion === "ideiUtilizator"}
          rateLimited={isRateLimited}
          suggestions={fieldSuggestions.ideiUtilizator}
          onUse={applySuggestion}
        />

        <button className="generate-button" style={styles.primaryBtn} onClick={handleGenerate} disabled={loading || !temaSaptamanala || !aiReady || isRateLimited}>
          {loading ? "AI-ul lucrează..." : isRateLimited ? `Așteaptă ${formatWait(rateLimitRemainingMs)}` : !aiReady ? "AI neconfigurat" : "✨ Generează planificarea"}
        </button>
        {isRateLimited && rateLimit && (
          <RateLimitNotice
            message={rateLimit.message}
            provider={rateLimit.provider}
            remainingMs={rateLimitRemainingMs}
            progress={rateLimitProgress}
          />
        )}
        {loading && <div className="generation-status" role="status" aria-live="polite">
          <div className="generation-message"><span className="loading-spinner" aria-hidden="true" /><div><strong>Se pregătește planificarea</strong><span>{generationProgress?.active.length ? generationProgress.active.map(item => item.retry ? `${item.day} (reîncercare)` : item.day).join(", ") + (generationProgress.active.length === 1 ? " se generează." : " se generează în paralel.") : "Se conectează la AI..."}</span></div></div>
          <ol className="generation-days">{selectedDays.map((day, index) => { const complete = !!generationProgress?.completed.includes(day); const active = !!generationProgress?.active.some(item => item.day === day); return <li key={day} className={complete ? "complete" : active ? "current" : ""}><span>{complete ? "✓" : index + 1}</span>{day}</li>; })}</ol>
          <div className="generation-track" role="progressbar" aria-label="Progresul planificării" aria-valuemin={0} aria-valuemax={selectedDays.length} aria-valuenow={generationProgress?.completed.length || 0}><span style={{ width: `${((generationProgress?.completed.length || 0) / selectedDays.length) * 100}%` }} /></div>
          <small>Se generează zilele selectate. Pentru Gemini, aplicația lucrează mai atent ca să evite limita de utilizare.</small>
        </div>}
        {error && <div style={styles.error}>{error}</div>}
        {message && <div style={styles.success}>{message}</div>}
      </section>

      {zile && (
        <section className="form-section results-section">
          <div className="result-toolbar" style={styles.resultHeader}>
            <div>
              <h2 style={styles.h2}>2. Rezultat editabil</h2>
              <p style={styles.muted}>{totalActivitati} activități în {zile.length} zile. Editează ideile, apoi previzualizează și descarcă documentele zilnice.</p>
              <p role="status" style={styles.muted}>{draftStatus}</p>
            </div>
          </div>

          <DocumentPreview data={{ saptamana, grupa, temaAnuala, temaProiect, temaSaptamanala, zile }} />

          {zile.map((zi, ziIndex) => {
            const isOpen = openDays[zi.ziua] ?? false;
            return (
              <section key={zi.ziua} className="day-panel">
                <button type="button" className="day-panel-header" onClick={() => toggleOpenDay(zi.ziua)} aria-expanded={isOpen}>
                  <span>{isOpen ? "▾" : "▸"}</span>
                  <strong>{zi.ziua}</strong>
                  <small>{zi.activitati.length} activități · {intervalsForDay(zi.activitati).length} intervale</small>
                </button>
                <button
                  type="button"
                  className="day-regenerate"
                  disabled={!!busyAction || isRateLimited}
                  onClick={() => regenerate("day", ziIndex)}
                >
                  {busyAction === `day-${zi.ziua}--all` ? "Se regenerează..." : "Regenerare zi"}
                </button>
                {isOpen && (
                  <div className="day-agenda">
                    <div className="day-agenda-heading">
                      <strong>Agenda zilei</strong>
                      <span>lucruri de ținut minte pentru tine</span>
                    </div>
                    <label>
                      Obiectivul zilei
                      <input
                        value={zi.agenda?.obiectiv || ""}
                        onChange={(event) => updateDayAgenda(ziIndex, "obiectiv", event.target.value)}
                        placeholder="ex: Copiii recunosc și numesc emoțiile de bază."
                      />
                    </label>
                    <label>
                      Materiale de pregătit
                      <textarea
                        value={zi.agenda?.materiale || ""}
                        onChange={(event) => updateDayAgenda(ziIndex, "materiale", event.target.value)}
                        placeholder="ex: cartonașe cu emoții, oglindă, coli colorate, lipici"
                      />
                    </label>
                    <label>
                      Notițe / lucruri importante
                      <textarea
                        value={zi.agenda?.notite || ""}
                        onChange={(event) => updateDayAgenda(ziIndex, "notite", event.target.value)}
                        placeholder="ex: insist pe exprimarea calmă, păstrez 5 minute pentru reflecție"
                      />
                    </label>
                  </div>
                )}
                {isOpen && intervalsForDay(zi.activitati).map(interval => {
                  const intervalActivities = zi.activitati.filter(activity => activity.interval === interval);
                  return (
                    <div className="interval-group" key={`${zi.ziua}-${interval}`}>
                      <div className="interval-heading">
                        <span>{interval}</span>
                        <button type="button" disabled={!!busyAction || isRateLimited} onClick={() => regenerate("interval", ziIndex, undefined, interval)}>
                          {busyAction === `interval-${zi.ziua}-${interval}-all` ? "Se regenerează..." : "Alte idei pe interval"}
                        </button>
                      </div>
                      {intervalActivities.map((a) => {
                        const activityIndex = zi.activitati.indexOf(a);
                        const activityBusy = busyAction === `activity-${zi.ziua}-${a.interval}-${activityIndex}`;
                        return (
                          <div key={`${zi.ziua}-${activityIndex}`} style={styles.activityEditor}>
                            <div className="activity-compact-head">
                              <span>{activityBadge(a.lead)}</span>
                              <strong>{normalizeActivityTitle(a.rest)}</strong>
                            </div>
                            <ActivityIntervalControl
                              day={zi.ziua}
                              index={activityIndex}
                              value={a.interval}
                              onChange={(value) => updateActivity(ziIndex, activityIndex, "interval", value)}
                            />
                            <div className="activity-edit-row" style={styles.activityRow}>
                              <input
                                aria-label={`Etichetă ${zi.ziua} activitatea ${activityIndex + 1}`}
                                style={{ ...styles.input, ...styles.leadInput }}
                                value={a.lead}
                                onChange={(e) => updateActivity(ziIndex, activityIndex, "lead", e.target.value)}
                              />
                              <div className="activity-actions">
                                <button type="button" className="idea-btn" disabled={!!busyAction || isRateLimited} onClick={() => regenerate("activity", ziIndex, activityIndex)}>
                                  {activityBusy ? "Se caută..." : "Altă idee"}
                                </button>
                                <button type="button" style={styles.removeBtn} disabled={!!busyAction} onClick={() => removeActivity(ziIndex, activityIndex)}>
                                  Șterge
                                </button>
                              </div>
                            </div>
                            <input
                              aria-label={`Titlu ${zi.ziua} activitatea ${activityIndex + 1}`}
                              style={styles.input}
                              value={a.rest}
                              onChange={(e) => updateActivity(ziIndex, activityIndex, "rest", e.target.value)}
                            />
                            <textarea
                              aria-label={`Explicație ${zi.ziua} activitatea ${activityIndex + 1}`}
                              style={{ ...styles.input, minHeight: 76, resize: "vertical" }}
                              value={a.explicatie}
                              onChange={(e) => updateActivity(ziIndex, activityIndex, "explicatie", e.target.value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </section>
      )}
    </main>
  );
}

function PlanningHistory({
  plans,
  canSave,
  onSave,
  onLoad,
  onDelete,
}: {
  plans: SavedPlan[];
  canSave: boolean;
  onSave: () => void;
  onLoad: (plan: SavedPlan) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="planning-history" aria-labelledby="history-title">
      <div>
        <p className="eyebrow">ISTORIC LOCAL</p>
        <h2 id="history-title">Planificări salvate</h2>
        <p>Salvează variantele bune și revino la ele fără să pierzi ce ai lucrat.</p>
      </div>
      <button type="button" className="history-save" disabled={!canSave} onClick={onSave}>
        Salvează în istoric
      </button>
      {plans.length > 0 ? (
        <div className="history-list">
          {plans.map(plan => (
            <article key={plan.id} className="history-item">
              <div>
                <strong>{plan.title}</strong>
                <span>{plan.data.grupa} · {formatSavedDate(plan.savedAt)}</span>
              </div>
              <div className="history-actions">
                <button type="button" onClick={() => onLoad(plan)}>Încarcă</button>
                <button type="button" className="danger" onClick={() => onDelete(plan.id)}>Șterge</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="history-empty">Nu ai încă planificări salvate în acest browser.</p>
      )}
    </section>
  );
}

function ThemeModeSwitcher({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  return (
    <div className="theme-switcher" role="group" aria-label="Alege tema vizuală">
      {THEME_MODES.map(mode => (
        <button
          key={mode.value}
          type="button"
          className={value === mode.value ? "active" : ""}
          aria-pressed={value === mode.value}
          onClick={() => onChange(mode.value)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function isSavedPlan(value: any): value is SavedPlan {
  const data = value?.data;
  return typeof value?.id === "string" &&
    typeof value?.savedAt === "string" &&
    typeof value?.title === "string" &&
    data &&
    validDays(data.zile) &&
    [data.temaAnuala, data.temaProiect, data.temaSaptamanala, data.saptamana, data.grupa, data.ideiUtilizator].every(item => typeof item === "string") &&
    Array.isArray(data.selectedDays);
}

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "dată necunoscută";
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Field({
  label,
  field,
  value,
  onChange,
  placeholder,
  multiline = false,
  onSuggest,
  busy = false,
  rateLimited = false,
  suggestions = [],
  onUse,
}: {
  label: string;
  field?: PlanningField;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  onSuggest?: (field: PlanningField) => void;
  busy?: boolean;
  rateLimited?: boolean;
  suggestions?: string[];
  onUse?: (field: PlanningField, value: string) => void;
}) {
  return (
    <div>
      <div className="field-label-row">
        <label style={styles.label}>{label}</label>
        {field && onSuggest && <button type="button" className="field-idea-btn" disabled={busy || rateLimited} onClick={() => onSuggest(field)}>{busy ? "Caut..." : rateLimited ? "Așteaptă" : "Dă-mi o idee"}</button>}
      </div>
      {multiline ? (
        <textarea style={{ ...styles.input, minHeight: 70 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
      {!!field && !!suggestions.length && (
        <div className="field-suggestions">
          {suggestions.map((suggestion, index) => (
            <button key={`${field}-${index}`} type="button" onClick={() => onUse?.(field, suggestion)}>
              <span>{suggestion}</span>
              <strong>Folosește</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RateLimitNotice({ message, provider, remainingMs, progress }: { message: string; provider?: string; remainingMs: number; progress: number }) {
  const label = providerLabel(provider);
  return (
    <div className="rate-limit-notice" role="status" aria-live="polite">
      <div className="rate-limit-row">
        <div>
          <strong>{label} are pauză de limită</strong>
          <span>{message}</span>
        </div>
        <time>{formatWait(remainingMs)}</time>
      </div>
      <div className="rate-limit-meter" aria-label={`Timp rămas ${formatWait(remainingMs)}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <small>Las aplicația să aștepte timpul indicat de API, apoi poți genera din nou.</small>
    </div>
  );
}

function providerLabel(provider?: string) {
  if (provider === "auto") return "Groq/Gemini";
  if (provider === "groq") return "Groq";
  if (provider === "gemini") return "Gemini";
  if (provider === "claude") return "Claude";
  return "AI-ul";
}

function formatWait(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} sec`;
  return `${minutes} min ${seconds.toString().padStart(2, "0")} sec`;
}

function ActivityIntervalControl({ day, index, value, onChange }: { day: string; index: number; value: string; onChange: (value: string) => void }) {
  const isCustom = !INTERVALS.includes(value);
  return (
    <div className="interval-control">
      <label>
        Interval orar
        <select
          aria-label={`Interval ${day} activitatea ${index + 1}`}
          value={isCustom ? "__custom" : value}
          onChange={(event) => onChange(event.target.value === "__custom" ? "Personalizat" : event.target.value)}
        >
          {INTERVALS.map(interval => <option key={interval} value={interval}>{interval}</option>)}
          <option value="__custom">Personalizat</option>
        </select>
      </label>
      {isCustom && (
        <label>
          Interval personalizat
          <input
            aria-label={`Interval personalizat ${day} activitatea ${index + 1}`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="ex: 10:30-11:00"
          />
        </label>
      )}
    </div>
  );
}

const styles: { [k: string]: React.CSSProperties } = {
  card: { background: "white", borderRadius: 14, padding: "1.5rem", marginTop: "1.5rem", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" },
  h2: { marginTop: 0, fontSize: "1.1rem", color: "#374151" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  label: { display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#444", marginTop: 10 },
  input: { width: "100%", padding: "0.55rem 0.7rem", marginTop: 4, marginBottom: 4, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box", fontSize: "0.95rem" },
  leadInput: { maxWidth: 220, fontWeight: 700 },
  pill: { padding: "0.5rem 1rem", borderRadius: 999, border: "1px solid #ddd", background: "white", cursor: "pointer" },
  pillActive: { background: "#F59E0B", color: "white", border: "1px solid #F59E0B" },
  primaryBtn: { padding: "0.7rem 1.4rem", borderRadius: 10, border: "none", background: "#F59E0B", color: "white", fontWeight: 700, cursor: "pointer", fontSize: "1rem" },
  secondaryBtn: { padding: "0.6rem 1rem", borderRadius: 10, border: "1px solid #F59E0B", background: "white", color: "#B45309", fontWeight: 700, cursor: "pointer" },
  linkBtn: { background: "none", border: "none", color: "#92400E", textDecoration: "underline", cursor: "pointer" },
  error: { color: "#DC2626", marginTop: 10, fontSize: "0.9rem" },
  success: { color: "#047857", marginTop: 10, fontSize: "0.9rem" },
  muted: { color: "#6B7280", fontSize: "0.9rem", margin: "0.25rem 0 0" },
  resultHeader: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" },
  dayBlock: { marginTop: 18, paddingTop: 12, borderTop: "1px solid #F3F4F6" },
  activityEditor: { border: "1px solid #F3F4F6", borderRadius: 10, padding: 12, marginBottom: 10, background: "#FFFBEB" },
  activityRow: { display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" },
  removeBtn: { padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid #FCA5A5", background: "white", color: "#B91C1C", cursor: "pointer", fontWeight: 700 },
};
