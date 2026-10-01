import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";

let hasPdfText = true;
try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { hasPdfText = false; }

const base = process.env.TEST_BASE_URL || "http://localhost:3100";
const headers = { "Content-Type": "application/json", Cookie: "session=valid" };
const request = (path, body, extra = {}) => fetch(base + path, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(body) });
let response = await fetch(base + "/api/ai-settings", { headers });
assert.deepEqual(await response.json(), { configured: false });
response = await request("/api/generate-ideas", { temaSaptamanala: "Familia" });
assert.equal(response.status, 400, "An environment key must not bypass the user's settings");
response = await request("/api/ai-settings", { provider: "claude", apiKey: "bad" });
assert.equal(response.status, 400);
const testKey = "sk-ant-api03_test_only_not_a_real_key_123456";
response = await request("/api/ai-settings", { provider: "claude", apiKey: testKey }, { Origin: "https://unrelated.example" });
assert.equal(response.status, 403);
response = await request("/api/ai-settings", { provider: "claude", apiKey: testKey });
assert.equal(response.status, 200);
const cookies = response.headers.getSetCookie();
assert.equal(cookies.length, 2);
assert.ok(cookies.every(cookie => /HttpOnly/i.test(cookie) && /SameSite=strict/i.test(cookie) && /Path=\/api/i.test(cookie) && /Max-Age=2592000/.test(cookie)));
const cookie = "session=valid; " + cookies.map(value => value.split(";")[0]).join("; ");
response = await fetch(base + "/api/ai-settings", { headers: { Cookie: cookie } });
assert.deepEqual(await response.json(), { configured: true, provider: "claude" });
response = await fetch(base + "/api/ai-settings", { method: "DELETE", headers: { Cookie: cookie } });
assert.ok(response.headers.getSetCookie().every(value => /Max-Age=0/.test(value)));
console.log("PASS: settings, HttpOnly cookies, deletion, missing key and cross-origin rejection");

const intervals = ["8:00-8:30", "8:30-9:00", "9:00-10:30", "11:00-12:00", "12:00-13:00"];
const data = {
  saptamana: "Săptămâna 3", grupa: "Grupa mijlocie (4-5 ani)", temaAnuala: "Cine sunt/suntem?", temaProiect: "Cine sunt eu?", temaSaptamanala: "Familia mea, universul meu",
  zile: [{ ziua: "Luni", activitati: intervals.flatMap((interval, i) => Array.from({ length: i === 2 || i === 3 ? 5 : 2 }, (_, n) => ({
    interval, lead: i === 0 ? "ALA – Joc liber / Activitate individuală: " : "ADP / ADE: ", rest: `Căsuța familiei – ideea ${i + 1}.${n + 1} (explorare).`,
    explicatie: "Materiale: cuburi, fotografii și hârtie. Pași: 1. Copilul alege o fotografie. 2. Construiește casa familiei. 3. Întrebăm: cine locuiește aici? Durată: 10 minute. Adaptează numărul pieselor la ritmul copilului.",
  }))) }],
};
const directory = await mkdtemp(join(tmpdir(), "gradinita-check-"));
for (const type of ["planificare", "ghid"]) {
  for (const format of ["pdf", "docx"]) {
    response = await request("/api/generate-docx", { type, format, data });
    assert.equal(response.status, 200, await response.clone().text());
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, format === "pdf" ? 5 : 2).toString(), format === "pdf" ? "%PDF-" : "PK");
    assert.match(response.headers.get("Content-Disposition"), new RegExp(`Luni.*\\.${format}`));
    const file = join(directory, `${type}.${format}`);
    await writeFile(file, bytes);
    if (format === "pdf") {
      const pdf = await PDFDocument.load(bytes);
      assert.ok(pdf.getPageCount() > 0);
    }
    if (format === "pdf" && hasPdfText) {
      const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
      assert.ok(text.includes("Luni") || text.includes("LUNI"));
      assert.ok(!text.includes("Marți"));
      assert.ok(text.includes("8:00-8:30"));
      assert.ok(text.includes("Căsuța"));
      if (type === "ghid") assert.ok(text.includes("Materiale:"));
      else assert.ok(text.includes("INTERVAL"));
    }
    console.log(`PASS: ${type} ${format}${hasPdfText ? ', diacritics and single-day content' : ''}`);
  }
}
response = await request("/api/generate-docx", { type: "ghid", format: "pdf", data: { ...data, zile: [{ ziua: "Luni", activitati: [] }] } });
assert.equal(response.status, 400);
console.log("PASS: empty document rejected");
const longData = { ...data, zile: [{ ziua: "Luni", activitati: [{ interval: "8:00-8:30", lead: "ALA:", rest: "ȘirLungFărăSpații".repeat(300), explicatie: "Materiale și pași pentru copii. ".repeat(140) + "FINAL GHID" }] }] };
for (const type of ["planificare", "ghid"]) {
  response = await request("/api/generate-docx", { type, format: "pdf", data: longData });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1, "Long content must paginate");
  const file = join(directory, `${type}-lung.pdf`);
  await writeFile(file, bytes);
  if (hasPdfText && type === "ghid") assert.match(execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }), /FINAL\s+GHID/);
  console.log(`PASS: long ${type}, ${pdf.getPageCount()} pages without converter`);
}
console.log(`Sample documents: ${directory}`);
