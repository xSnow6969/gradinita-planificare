import { NextResponse } from "next/server";
import { buildPlanificareDocx, buildGhidDocx, PlanificareInput } from "@/lib/docx-planificare";
import { buildPdf } from "@/lib/pdf-export";
import { validDays } from "@/lib/planning-validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, data, format = "docx" } = body as { type: "planificare" | "ghid"; data: PlanificareInput; format?: "pdf" | "docx" };

    if (!["planificare", "ghid"].includes(type)) {
      return NextResponse.json({ error: "Tip document invalid." }, { status: 400 });
    }

    if (!["pdf", "docx"].includes(format) || !data?.temaSaptamanala || !validDays(data.zile) || ![data.saptamana, data.grupa, data.temaAnuala, data.temaProiect, data.temaSaptamanala].every(v => typeof v === "string" && v.length <= 2000)) {
      return NextResponse.json({ error: "Date insuficiente pentru document." }, { status: 400 });
    }

    const safeTema = data.temaSaptamanala
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "tema";

    const day = data.zile.length === 1 ? data.zile[0].ziua.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "Saptamana";
    const filename = `${type === "ghid" ? "Ghid" : "Planificare"}_${day}_${safeTema}.${format}`;
    const output = format === "pdf" ? await buildPdf(data, type) :
      type === "ghid" ? await buildGhidDocx(data) : await buildPlanificareDocx(data);

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type":
          format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Eroare la generarea documentului." }, { status: 500 });
  }
}
