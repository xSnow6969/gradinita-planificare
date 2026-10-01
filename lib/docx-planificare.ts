import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, VerticalAlignTable, ShadingType, TableLayoutType,
  type TableVerticalAlign,
} from "docx";
import type { DayActivities } from "./ai-providers";
import { intervalsForDay } from "./planning-validation";
import { dayShortGuide, normalizeActivityTitle } from "./activity-format";

const FONT = "Times New Roman";
const HEADER_FILL = "EF9ACB";
const BODY_SIZE = 20;
const HEADER_SIZE = 20;

function titleP(text: string, size = 24) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text, bold: true, size, font: FONT })],
  });
}

function activityP(lead: string, rest: string) {
  const cleanLead = lead.trim();
  const cleanRest = normalizeActivityTitle(rest);
  const main = /^(ALA|ADP|ADE|MM|JOC)/i.test(cleanLead);
  const indented = /^(DLC|DPM|DEC|DOS|Ș|JR|C|A|B|R|MP|T)\s*[:–-]/i.test(cleanLead);
  return new Paragraph({
    spacing: { after: 28 },
    indent: main ? { left: 0, hanging: 0 } : indented ? { left: 360 } : undefined,
    children: [
      ...(main ? [new TextRun({ text: "➢  ", size: BODY_SIZE, font: FONT })] : []),
      new TextRun({ text: cleanLead, bold: true, size: BODY_SIZE, font: FONT }),
      new TextRun({ text: cleanRest ? ` ${cleanRest}` : "", size: BODY_SIZE, font: FONT }),
    ],
  });
}

function intervalP(text: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 28 },
    children: [new TextRun({ text, size: BODY_SIZE, font: FONT })],
  });
}

function leadP(lead: string, rest: string) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: lead, bold: true, size: 20, font: FONT }),
      new TextRun({ text: rest, size: 20, font: FONT }),
    ],
  });
}

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

function headerCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: HEADER_FILL },
    verticalAlign: VerticalAlignTable.CENTER,
    borders,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, size: HEADER_SIZE, font: FONT })],
      }),
    ],
  });
}

function dataCell(
  children: Paragraph[],
  width: number,
  verticalAlign: TableVerticalAlign = VerticalAlignTable.TOP
) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign,
    borders,
    margins: { top: 55, bottom: 55, left: 80, right: 80 },
    children,
  });
}

const W_ZIUA = 1150;
const W_TIME = 1450;
const W_ACT = 7866;

export interface PlanificareInput {
  saptamana: string;
  grupa: string;
  temaAnuala: string;
  temaProiect: string;
  temaSaptamanala: string;
  zile: DayActivities[];
}

export async function buildPlanificareDocx(data: PlanificareInput): Promise<Buffer> {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [headerCell("ZIUA", W_ZIUA), headerCell("INTERVAL ORAR", W_TIME), headerCell("ACTIVITĂȚI DE ÎNVĂȚARE", W_ACT)],
    }),
  ];

  for (const zi of data.zile) {
    const intervalParagraphs: Paragraph[] = [];
    const activityParagraphs: Paragraph[] = [];
    for (const interval of intervalsForDay(zi.activitati)) {
      const activities = zi.activitati.filter(activity => activity.interval === interval);
      activities.forEach((activity, index) => {
        intervalParagraphs.push(intervalP(index === 0 ? interval : " "));
        activityParagraphs.push(activityP(activity.lead, activity.rest));
      });
    }

    rows.push(new TableRow({
      children: [
        dataCell([
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: zi.ziua, bold: true, size: BODY_SIZE, font: FONT })],
          }),
        ], W_ZIUA, VerticalAlignTable.CENTER),
        dataCell(intervalParagraphs.length ? intervalParagraphs : [intervalP(" ")], W_TIME),
        dataCell(activityParagraphs.length ? activityParagraphs : [activityP("", "")], W_ACT),
      ],
    }));
  }

  const table = new Table({
    width: { size: W_ZIUA + W_TIME + W_ACT, type: WidthType.DXA },
    columnWidths: [W_ZIUA, W_TIME, W_ACT],
    layout: TableLayoutType.FIXED,
    rows,
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          titleP("PLANIFICAREA ACTIVITĂȚILOR ZILNICE", 24),
          titleP(data.saptamana.toUpperCase(), 22),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [new TextRun({ text: data.grupa, size: 19, font: FONT, italics: true })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: "Tema anuală de studiu: ", bold: true, size: 19, font: FONT }),
              new TextRun({ text: data.temaAnuala, size: 19, font: FONT }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: "Tema proiectului: ", bold: true, size: 19, font: FONT }),
              new TextRun({ text: data.temaProiect, size: 19, font: FONT }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Tema săptămânală: ", bold: true, size: 19, font: FONT }),
              new TextRun({ text: data.temaSaptamanala, size: 19, font: FONT }),
            ],
          }),
          table,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function buildGhidDocx(data: PlanificareInput): Promise<Buffer> {
  const children: Paragraph[] = [
    titleP("GHID DETALIAT - CE AI DE FĂCUT ÎN FIECARE ZI", 26),
    titleP(data.saptamana.toUpperCase(), 22),
    titleP(data.grupa, 20),
    leadP("Tema anuală de studiu: ", data.temaAnuala),
    leadP("Tema proiectului: ", data.temaProiect),
    new Paragraph({
      spacing: { after: 300 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: data.temaSaptamanala, italics: true, size: 22, font: FONT }),
      ],
    }),
  ];

  for (const zi of data.zile) {
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 150 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "F59E0B" } },
        children: [new TextRun({ text: zi.ziua.toUpperCase(), bold: true, size: 28, font: FONT, color: "B45309" })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 130 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F7E7F1" },
        children: [new TextRun({ text: dayShortGuide(zi, data.temaSaptamanala), size: 20, font: FONT, italics: true })],
      })
    );
    for (const a of zi.activitati) {
      children.push(
        new Paragraph({
          spacing: { before: 150, after: 40 },
          children: [
            new TextRun({ text: `${a.interval} | ${a.lead}`, bold: true, size: 21, font: FONT }),
            new TextRun({ text: normalizeActivityTitle(a.rest), bold: true, size: 21, font: FONT }),
          ],
        })
      );
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          indent: { left: 300 },
          children: [new TextRun({ text: a.explicatie, size: 20, font: FONT, italics: true })],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, bottom: 720, left: 900, right: 900 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
