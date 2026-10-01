import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PlanificareInput } from "./docx-planificare";
import { intervalsForDay } from "./planning-validation";
import { dayShortGuide, normalizeActivityTitle } from "./activity-format";

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN_X = 65;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 54;
const TABLE_WIDTH = WIDTH - MARGIN_X * 2;
const COL_DAY = 54;
const COL_TIME = 70;
const COL_ACTIVITY = TABLE_WIDTH - COL_DAY - COL_TIME;
const CELL_PAD_X = 6;
const CELL_PAD_Y = 6;
const BODY_SIZE = 9.4;
const SMALL_SIZE = 8.8;
const LINE_HEIGHT = 12.4;
const PARA_GAP = 2;
const HEADER_FILL = rgb(0.91, 0.56, 0.79);
const BLACK = rgb(0, 0, 0);
const BORDER = rgb(0, 0, 0);
const PDF_TEXT_WIDTH_SAFETY = 72;

type Fonts = { regular: PDFFont; bold: PDFFont };
type RichRun = { text: string; font: PDFFont };
type RichLine = { runs: RichRun[]; width: number };
type ActivityLine = { interval: string; line: RichLine; indent: number; after: number };

function textWidth(runs: RichRun[], size: number) {
  return runs.reduce((total, run) => total + run.font.widthOfTextAtSize(run.text, size), 0);
}

function pushRun(runs: RichRun[], run: RichRun) {
  if (!run.text) return;
  const last = runs.at(-1);
  if (last && last.font === run.font) last.text += run.text;
  else runs.push({ ...run });
}

function wrapRuns(runs: RichRun[], size: number, width: number): RichLine[] {
  const lines: RichLine[] = [];
  let current: RichRun[] = [];

  function commit() {
    if (!current.length) return;
    lines.push({ runs: current, width: textWidth(current, size) });
    current = [];
  }

  for (const run of runs) {
    const words = run.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    for (const word of words) {
      const prefix = current.length ? " " : "";
      const candidate = [...current];
      pushRun(candidate, { text: prefix + word, font: run.font });
      if (textWidth(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      commit();
      let fragment = "";
      for (const character of word) {
        const next = fragment + character;
        if (fragment && run.font.widthOfTextAtSize(next, size) > width) {
          lines.push({ runs: [{ text: fragment, font: run.font }], width: run.font.widthOfTextAtSize(fragment, size) });
          fragment = character;
        } else {
          fragment = next;
        }
      }
      if (fragment) current = [{ text: fragment, font: run.font }];
    }
  }
  commit();
  return lines.length ? lines : [{ runs: [{ text: " ", font: runs[0]?.font }], width: 0 }];
}

function isMainActivity(lead: string) {
  return /^(ALA|ADP|ADE|MM|JOC)/i.test(lead.trim());
}

function isIndentedActivity(lead: string) {
  return /^(DLC|DPM|DEC|DOS|Ș|JR|C|A|B|R|MP|T)\s*[:–-]/i.test(lead.trim());
}

function activityLines(lead: string, rest: string, interval: string, firstInInterval: boolean, fonts: Fonts): ActivityLine[] {
  const cleanLead = lead.trim();
  const cleanRest = normalizeActivityTitle(rest);
  const main = isMainActivity(cleanLead);
  const indent = main ? 0 : isIndentedActivity(cleanLead) ? 22 : 0;
  const runs: RichRun[] = [];
  if (main) runs.push({ text: "➢  ", font: fonts.regular });
  runs.push({ text: cleanLead, font: fonts.bold });
  if (cleanRest) runs.push({ text: ` ${cleanRest}`, font: fonts.regular });

  const lines = wrapRuns(runs, BODY_SIZE, COL_ACTIVITY - CELL_PAD_X * 2 - indent - PDF_TEXT_WIDTH_SAFETY);
  return lines.map((line, index) => ({
    interval: firstInInterval && index === 0 ? interval : "",
    line,
    indent,
    after: index === lines.length - 1 ? PARA_GAP : 0,
  }));
}

function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, width: number) {
  page.drawText(text, {
    x: x + (width - font.widthOfTextAtSize(text, size)) / 2,
    y,
    size,
    font,
    color: BLACK,
  });
}

function drawRichLine(page: PDFPage, line: RichLine, x: number, y: number, size: number) {
  let cursor = x;
  for (const run of line.runs) {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color: BLACK });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }
}

export async function buildPdf(data: PlanificareInput, type: "planificare" | "ghid"): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/DejaVuSans.ttf")),
    readFile(join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf")),
  ]);
  const fonts: Fonts = {
    regular: await pdf.embedFont(regularBytes, { subset: true }),
    bold: await pdf.embedFont(boldBytes, { subset: true }),
  };
  pdf.setTitle(`${type === "ghid" ? "Ghid practic" : "Planificare"} - ${data.temaSaptamanala}`);
  pdf.setLanguage("ro-RO");

  let page: PDFPage;
  let y = 0;

  function newPage() {
    page = pdf.addPage([WIDTH, HEIGHT]);
    y = HEIGHT - MARGIN_TOP;
  }

  function ensure(height: number) {
    if (y - height < MARGIN_BOTTOM) newPage();
  }

  function drawPlain(text: string, font = fonts.regular, size = BODY_SIZE, centered = false, spacing = 5) {
    const width = centered ? TABLE_WIDTH : TABLE_WIDTH;
    const lines = wrapRuns([{ text, font }], size, width);
    for (const line of lines) {
      ensure(size + 5);
      const x = centered ? MARGIN_X + (TABLE_WIDTH - line.width) / 2 : MARGIN_X;
      drawRichLine(page, line, x, y - size, size);
      y -= size + 4;
    }
    y -= spacing;
  }

  function drawTableHeader() {
    const height = 26;
    const columns = [
      { text: "ZIUA", x: MARGIN_X, width: COL_DAY },
      { text: "INTERVAL\nORAR", x: MARGIN_X + COL_DAY, width: COL_TIME },
      { text: "ACTIVITĂȚI DE ÎNVĂȚARE", x: MARGIN_X + COL_DAY + COL_TIME, width: COL_ACTIVITY },
    ];
    for (const column of columns) {
      page.drawRectangle({
        x: column.x,
        y: y - height,
        width: column.width,
        height,
        color: HEADER_FILL,
        borderColor: BORDER,
        borderWidth: 0.6,
      });
      const parts = column.text.split("\n");
      parts.forEach((part, index) => {
        const lineY = y - 11 - index * 11;
        drawCentered(page, part, fonts.bold, BODY_SIZE, column.x, lineY, column.width);
      });
    }
    y -= height;
  }

  function rowHeight(lines: ActivityLine[]) {
    return CELL_PAD_Y * 2 + lines.reduce((total, line) => total + LINE_HEIGHT + line.after, 0);
  }

  function drawDayChunk(day: string, lines: ActivityLine[], showDay: boolean) {
    const height = rowHeight(lines);
    const xDay = MARGIN_X;
    const xTime = xDay + COL_DAY;
    const xActivity = xTime + COL_TIME;
    page.drawRectangle({ x: xDay, y: y - height, width: COL_DAY, height, borderColor: BORDER, borderWidth: 0.55 });
    page.drawRectangle({ x: xTime, y: y - height, width: COL_TIME, height, borderColor: BORDER, borderWidth: 0.55 });
    page.drawRectangle({ x: xActivity, y: y - height, width: COL_ACTIVITY, height, borderColor: BORDER, borderWidth: 0.55 });
    if (showDay) drawCentered(page, day, fonts.regular, BODY_SIZE, xDay, y - height / 2 - BODY_SIZE / 2, COL_DAY);

    let cursor = y - CELL_PAD_Y - BODY_SIZE;
    for (const line of lines) {
      if (line.interval) drawCentered(page, line.interval, fonts.regular, BODY_SIZE, xTime, cursor, COL_TIME);
      drawRichLine(page, line.line, xActivity + CELL_PAD_X + line.indent, cursor, BODY_SIZE);
      cursor -= LINE_HEIGHT + line.after;
    }
    y -= height;
  }

  function drawPlanificare() {
    newPage();
    drawPlain("PLANIFICAREA ACTIVITĂȚILOR ZILNICE", fonts.bold, 14, true, 12);
    drawPlain(data.saptamana.toUpperCase(), fonts.bold, 13, true, 30);
    drawPlain(`Tema anuală de studiu: ${data.temaAnuala}`, fonts.regular, 11, false, 1);
    drawPlain(`Tema proiectului: ${data.temaProiect}`, fonts.regular, 11, false, 1);
    drawPlain(`Tema săptămânală: ${data.temaSaptamanala}`, fonts.regular, 11, false, 26);
    drawTableHeader();

    for (const day of data.zile) {
      const lines: ActivityLine[] = [];
      for (const interval of intervalsForDay(day.activitati)) {
        const activities = day.activitati.filter(activity => activity.interval === interval);
        activities.forEach((activity, index) => {
          lines.push(...activityLines(activity.lead, activity.rest, interval, index === 0, fonts));
        });
      }

      let offset = 0;
      let firstChunk = true;
      while (offset < lines.length) {
        if (y - 40 < MARGIN_BOTTOM) newPage();
        const chunk: ActivityLine[] = [];
        while (offset < lines.length) {
          const next = [...chunk, lines[offset]];
          if (chunk.length && y - rowHeight(next) < MARGIN_BOTTOM) break;
          chunk.push(lines[offset]);
          offset += 1;
          if (y - rowHeight(chunk) < MARGIN_BOTTOM) break;
        }
        drawDayChunk(day.ziua, chunk, firstChunk);
        firstChunk = false;
      }
    }
  }

  function drawAgenda(agenda: PlanificareInput["zile"][number]["agenda"]) {
    const entries = [
      ["Obiectivul zilei: ", agenda?.obiectiv],
      ["Materiale de pregătit: ", agenda?.materiale],
      ["Notițe: ", agenda?.notite],
    ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0);
    if (!entries.length) return;
    drawPlain("Agenda zilei", fonts.bold, SMALL_SIZE, false, 2);
    for (const [label, value] of entries) {
      drawPlain(`${label}${value}`, fonts.regular, SMALL_SIZE, false, 2);
    }
    y -= 4;
  }

  function drawGhid() {
    newPage();
    drawPlain("GHID PRACTIC DE ACTIVITĂȚI", fonts.bold, 14, true, 10);
    drawPlain(data.saptamana.toUpperCase(), fonts.bold, 13, true, 8);
    drawPlain(data.grupa, fonts.regular, 10, true, 18);
    drawPlain(`Tema anuală de studiu: ${data.temaAnuala}`, fonts.regular, 10, false, 1);
    drawPlain(`Tema proiectului: ${data.temaProiect}`, fonts.regular, 10, false, 1);
    drawPlain(`Tema săptămânală: ${data.temaSaptamanala}`, fonts.regular, 10, false, 16);

    for (const day of data.zile) {
      ensure(45);
      drawPlain(day.ziua.toUpperCase(), fonts.bold, 12, false, 6);
      drawPlain(dayShortGuide(day, data.temaSaptamanala), fonts.regular, SMALL_SIZE, false, 8);
      drawAgenda(day.agenda);
      for (const activity of day.activitati) {
        ensure(54);
        drawPlain(`${activity.interval} | ${activity.lead.trim()} ${normalizeActivityTitle(activity.rest)}`, fonts.bold, SMALL_SIZE, false, 1);
        drawPlain(activity.explicatie, fonts.regular, SMALL_SIZE, false, 7);
      }
    }
  }

  if (type === "planificare") drawPlanificare();
  else drawGhid();

  return Buffer.from(await pdf.save());
}
