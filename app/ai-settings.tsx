"use client";
import { useEffect, useRef, useState } from "react";

export default function AiSettings({ onReady }: { onReady: (ready: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [configured, setConfigured] = useState(false);
  const [source, setSource] = useState<"server" | "browser" | null>(null);
  const [provider, setProvider] = useState<AiProviderChoice>("claude");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/ai-settings", { cache: "no-store" }).then(async res => {
      if (!res.ok) throw new Error("Nu am putut verifica setările AI.");
      return res.json();
    }).then(data => {
      if (!active) return;
      setConfigured(data.configured); setSource(data.source || null); setProvider(data.provider || "claude"); onReady(data.configured);
      if (!data.configured) dialog.current?.showModal();
    }).catch(() => { if (active) { setError("Nu am putut verifica setările. Încearcă din nou."); dialog.current?.showModal(); } });
    return () => { active = false; };
  }, [onReady]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch("/api/ai-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfigured(true); setSource(data.source || "browser"); setProvider(data.provider || provider); onReady(true); setApiKey(""); dialog.current?.close();
    } catch (error: any) { setError(error.message || "Salvarea a eșuat."); }
    finally { setBusy(false); }
  }
  async function forget() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/ai-settings", { method: "DELETE" });
      if (!res.ok) throw new Error("Nu am putut șterge cheia.");
      const data = await res.json();
      setConfigured(data.configured); setSource(data.source || null); setProvider(data.provider || provider); onReady(data.configured); setApiKey("");
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <>
    <button className="settings-trigger" type="button" onClick={() => { setError(""); dialog.current?.showModal(); }}>✳ <span>Setări AI</span></button>
    <dialog className="ai-dialog" ref={dialog} aria-labelledby="ai-title" onClose={() => setApiKey("")}>
      <form onSubmit={save} style={{ display: "grid", gap: 16 }}>
        <h2 id="ai-title" style={{ margin: 0 }}>Configurează asistentul AI</h2>
        <p style={{ margin: 0 }}>{source === "server" ? `${providerLabel(provider)} este configurat pe server. Poți lăsa această fereastră închisă.` : "Introdu cheia ta o singură dată. O reținem în acest browser timp de 30 de zile."}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <button className="provider-choice" type="button" disabled={source === "server"} onClick={() => setProvider("auto")} aria-pressed={provider === "auto"}><span className="provider-mark">A</span><span><strong>Auto</strong><small>Groq/Gemini</small></span>{provider === "auto" && <span className="provider-selected">Selectat</span>}</button>
          <button className="provider-choice" type="button" disabled={source === "server"} onClick={() => setProvider("claude")} aria-pressed={provider === "claude"}><span className="provider-mark">C</span><span><strong>Claude</strong><small>Anthropic API</small></span>{provider === "claude" && <span className="provider-selected">Selectat</span>}</button>
          <button className="provider-choice" type="button" disabled={source === "server"} onClick={() => setProvider("gemini")} aria-pressed={provider === "gemini"}><span className="provider-mark">G</span><span><strong>Gemini</strong><small>Google AI</small></span>{provider === "gemini" && <span className="provider-selected">Selectat</span>}</button>
          <button className="provider-choice" type="button" disabled={source === "server"} onClick={() => setProvider("groq")} aria-pressed={provider === "groq"}><span className="provider-mark">Q</span><span><strong>Groq</strong><small>OpenAI compat.</small></span>{provider === "groq" && <span className="provider-selected">Selectat</span>}</button>
        </div>
        <label className="form-label">Cheie API {providerLabel(provider)} <input className="form-input" autoFocus type="password" autoComplete="off" required minLength={20} maxLength={provider === "gemini" || provider === "groq" || provider === "auto" ? 3000 : 512} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={providerPlaceholder(provider)} /></label>
        <small className="settings-note">{source === "server" ? `Cheia este citită din ${serverEnvName(provider)} și nu este trimisă în browser.` : provider === "gemini" || provider === "groq" ? `Pentru ${providerLabel(provider)} poți pune mai multe chei separate prin virgulă. Le reținem într-un cookie HttpOnly.` : provider === "auto" ? "Poți pune chei Groq/Gemini pe rânduri separate sau prin virgulă. Pentru server recomand .env.local." : "Cheia rămâne într-un cookie HttpOnly timp de 30 de zile. Se verifică la prima generare."}</small>
        {error && <p role="alert" style={{ color: "#B91C1C" }}>{error}</p>}
        <button disabled={busy} type="submit">{busy ? "Se salvează..." : "Salvează cheia"}</button>
        {configured && source === "browser" && <button disabled={busy} type="button" onClick={forget}>Șterge cheia salvată</button>}
        <button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Închide</button>
      </form>
    </dialog>
  </>;
}

type AiProviderChoice = "auto" | "claude" | "gemini" | "groq";

function providerLabel(provider: AiProviderChoice) {
  if (provider === "auto") return "Auto Groq/Gemini";
  if (provider === "gemini") return "Gemini";
  if (provider === "groq") return "Groq";
  return "Claude";
}

function providerPlaceholder(provider: AiProviderChoice) {
  if (provider === "auto") return "Chei Groq/Gemini, separate prin virgulă sau rânduri";
  if (provider === "claude") return "sk-ant-...";
  if (provider === "groq") return "gsk_...";
  return "Cheia din Google AI Studio";
}

function serverEnvName(provider: AiProviderChoice) {
  if (provider === "auto") return "GROQ_API_KEY(S) + GEMINI_API_KEY(S)";
  if (provider === "gemini") return "GEMINI_API_KEY / GEMINI_API_KEYS";
  if (provider === "groq") return "GROQ_API_KEY / GROQ_API_KEYS";
  return "ANTHROPIC_API_KEY";
}
