"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanificareInput } from "@/lib/docx-planificare";
import { intervalsForDay } from "@/lib/planning-validation";
import { dayShortGuide, normalizeActivityTitle } from "@/lib/activity-format";

type DocumentType = "planificare" | "ghid";
type DownloadFormat = "pdf" | "docx";

export default function DocumentPreview({ data }: { data: PlanificareInput }) {
  const [day, setDay] = useState("all");
  const [type, setType] = useState<DocumentType>("planificare");
  const [format, setFormat] = useState<DownloadFormat>("pdf");
  const [snapshot, setSnapshot] = useState<PlanificareInput | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pdf = useRef<Blob | null>(null);
  const selected = useMemo(() => {
    if (day === "all") return data.zile;
    const picked = data.zile[Number(day)];
    return picked ? [picked] : data.zile;
  }, [data.zile, day]);
  const livePreview = useMemo(() => ({ ...data, zile: selected }), [data, selected]);
  const previewData = livePreview;

  useEffect(() => {
    if (!snapshot) return;
    const controller = new AbortController();
    let objectUrl = "";
    setUrl(""); setError(""); pdf.current = null;
    fetch("/api/generate-docx", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, format: "pdf", data: snapshot }) })
      .then(async res => { if (!res.ok) throw new Error((await res.json()).error); return res.blob(); })
      .then(blob => { if (controller.signal.aborted) return; pdf.current = blob; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message || "Previzualizarea a eșuat."); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [snapshot, type]);

  function preview() {
    setSnapshot({ ...data, zile: selected });
  }

  async function download() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/generate-docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, format, data: previewData }) });
      if (!res.ok) throw new Error((await res.json()).error);
      const blob = await res.blob();
      const fileUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      const name = previewData.zile.length === 1 ? previewData.zile[0].ziua : "Saptamana";
      anchor.download = `${type}_${name}_${previewData.temaSaptamanala.replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 60)}.${format}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <section className="document-section" style={{ marginTop: 24, padding: 20, background: "#F0FDF4", borderRadius: 12 }}>
    <h3 style={{ marginTop: 0 }}>Documente pentru planificare</h3>
    <p>Alege săptămâna completă sau o zi, verifică previzualizarea, apoi descarcă PDF sau Word.</p>
    <div className="document-controls">
      <label>Perioada<select value={day} onChange={e => setDay(e.target.value)}><option value="all">Săptămâna completă</option>{data.zile.map((z, i) => <option key={z.ziua} value={String(i)}>{z.ziua}</option>)}</select></label>
      <label>Document<select value={type} onChange={e => setType(e.target.value as DocumentType)}><option value="planificare">Planificare cu intervale orare</option><option value="ghid">Ghid practic de activități</option></select></label>
      <button type="button" onMouseDown={preview} onClick={preview}>Previzualizează</button>
    </div>
    <div className="preview-panel" aria-labelledby="preview-title">
      <div className="preview-panel-header">
        <div>
          <h2 id="preview-title">{type === "ghid" ? "Ghid practic" : "Planificare"} — {previewData.zile.length === 1 ? previewData.zile[0].ziua : "Săptămâna completă"}</h2>
          <p>Previzualizare PDF a documentului. În Word, paginarea poate varia ușor în funcție de aplicație și fonturi.</p>
        </div>
      </div>
      {error && <p role="alert" style={{ color: "#B91C1C" }}>{error}</p>}
      <DocumentHtmlPreview data={previewData} type={type} />
      {snapshot && !url && !error && <p role="status">Se pregătește fișierul PDF pentru descărcare...</p>}
      <div className="preview-actions">
        <label>Format <select value={format} onChange={e => setFormat(e.target.value as DownloadFormat)}><option value="pdf">PDF</option><option value="docx">Word (.docx)</option></select></label>
        <button disabled={busy} onClick={download}>{busy ? "Se descarcă..." : "Descarcă documentul"}</button>
        {url && <a className="preview-link" href={url} target="_blank" rel="noreferrer">Deschide PDF separat</a>}
        {error && <button onClick={() => setSnapshot(current => current ? { ...current } : null)}>Reîncearcă previzualizarea</button>}
      </div>
    </div>
  </section>;
}

function DocumentHtmlPreview({ data, type }: { data: PlanificareInput; type: DocumentType }) {
  if (type === "ghid") {
    return <div className="preview-paper preview-guide">
      <h3>GHID PRACTIC DE ACTIVITĂȚI</h3>
      <p className="preview-meta">{data.saptamana} · {data.grupa}</p>
      <p><strong>Tema anuală de studiu:</strong> {data.temaAnuala}</p>
      <p><strong>Tema proiectului:</strong> {data.temaProiect}</p>
      <p><strong>Tema săptămânală:</strong> {data.temaSaptamanala}</p>
      {data.zile.map(day => <section key={day.ziua}>
        <h4>{day.ziua}</h4>
        <p className="day-summary">{dayShortGuide(day, data.temaSaptamanala)}</p>
        {day.activitati.map((activity, index) => <article key={`${day.ziua}-${index}`}>
          <strong>{activity.interval} | {activity.lead} {normalizeActivityTitle(activity.rest)}</strong>
          <p>{activity.explicatie}</p>
        </article>)}
      </section>)}
    </div>;
  }

  return <div className="preview-paper">
    <h3>PLANIFICAREA ACTIVITĂȚILOR ZILNICE</h3>
    <p className="preview-meta">{data.saptamana} · {data.grupa}</p>
    <p><strong>Tema anuală de studiu:</strong> {data.temaAnuala}</p>
    <p><strong>Tema proiectului:</strong> {data.temaProiect}</p>
    <p><strong>Tema săptămânală:</strong> {data.temaSaptamanala}</p>
    <div className="preview-table-wrap">
      <table className="preview-table">
        <thead>
          <tr><th>ZIUA</th><th>INTERVAL ORAR</th><th>ACTIVITĂȚI DE ÎNVĂȚARE</th></tr>
        </thead>
        <tbody>
          {data.zile.map(day => {
            const intervals = intervalsForDay(day.activitati);
            return intervals.map((interval, intervalIndex) => {
              const activities = day.activitati.filter(activity => activity.interval === interval);
              return <tr key={`${day.ziua}-${interval}`}>
                {intervalIndex === 0 && <td rowSpan={intervals.length}>{day.ziua}</td>}
                <td>{interval}</td>
                <td>{activities.map((activity, index) => <p key={index}><strong>{activity.lead}</strong> {normalizeActivityTitle(activity.rest)}</p>)}</td>
              </tr>;
            });
          })}
        </tbody>
      </table>
    </div>
  </div>;
}
