import { NextResponse } from "next/server";
import { buildPlanificareDocx } from "@/lib/docx-planificare";
import type { PlanificareInput } from "@/lib/docx-planificare";

export const runtime = "nodejs";

const example: PlanificareInput = {
  saptamana: "Săptămâna 1",
  grupa: "Grupa mijlocie (4-5 ani)",
  temaAnuala: "Cine sunt/suntem?",
  temaProiect: "Familia mea",
  temaSaptamanala: "Familia mea",
  zile: [
    {
      ziua: "Luni",
      activitati: [
        { interval: "8:00-8:30", lead: "Primirea copiilor:", rest: "„Bună dimineața, familie!”", explicatie: "Copiii sunt întâmpinați individual și invitați să aleagă un cartonaș cu o persoană dragă." },
        { interval: "8:30-9:00", lead: "Întâlnirea de dimineață:", rest: "„Cine face parte din familia mea?”", explicatie: "Fiecare copil numește membrii familiei pe care dorește să îi prezinte. Educatoarea valorizează toate formele de familie." },
        { interval: "9:00-10:30", lead: "Activitate de limbaj:", rest: "„Povestea familiei mele”", explicatie: "Pornind de la o fotografie sau un desen, copiii formulează propoziții despre o activitate plăcută petrecută împreună." },
        { interval: "11:00-12:00", lead: "Activitate artistică:", rest: "„Portretul unei persoane dragi”", explicatie: "Copiii realizează un portret prin desen și aleg culorile și materialele pe care doresc să le folosească." },
        { interval: "12:00-13:00", lead: "Joc de rol:", rest: "„Acasă, împreună”", explicatie: "În centrul Joc de rol, copiii aleg roluri și pun în scenă activități cotidiene desfășurate împreună." },
      ],
    },
    {
      ziua: "Marți",
      activitati: [
        { interval: "8:00-8:30", lead: "Primirea copiilor:", rest: "„Un gând bun pentru ai mei”", explicatie: "Copiii aleg o imagine care exprimă cum se simt când sunt alături de familie." },
        { interval: "8:30-9:00", lead: "Calendarul naturii:", rest: "„Cum ne ajutăm acasă?”", explicatie: "Discuție despre sarcini potrivite vârstei și despre felurile în care membrii familiei se sprijină." },
        { interval: "9:00-10:30", lead: "Activitate matematică:", rest: "„Așezăm masa pentru familie”", explicatie: "Copiii distribuie farfurii și tacâmuri pentru un număr dat de persoane, numărând obiectele și verificând corespondența unu la unu." },
        { interval: "11:00-12:00", lead: "Construcții:", rest: "„Casa în care locuim”", explicatie: "În echipe, copiii construiesc o casă din cuburi și descriu spațiile pe care le-au amenajat." },
        { interval: "12:00-13:00", lead: "Joc de mișcare:", rest: "„Du mesajul acasă”", explicatie: "Copiii transportă pe rând un cartonaș până la casa echipei, respectând traseul și regulile jocului." },
      ],
    },
    {
      ziua: "Miercuri",
      activitati: [
        { interval: "8:00-8:30", lead: "Primirea copiilor:", rest: "„Albumul amintirilor”", explicatie: "Copiii răsfoiesc imagini și aleg una despre care vor să povestească." },
        { interval: "8:30-9:00", lead: "Întâlnirea de dimineață:", rest: "„Ce îmi place să fac împreună?”", explicatie: "Copiii împărtășesc activități preferate și ascultă experiențele colegilor." },
        { interval: "9:00-10:30", lead: "Activitate practică:", rest: "„Un cadou pentru cineva drag”", explicatie: "Folosind hârtie colorată și materiale reutilizabile, fiecare copil confecționează o felicitare." },
        { interval: "11:00-12:00", lead: "Joc didactic:", rest: "„Ghicește obiectul”", explicatie: "Copiii descriu un obiect folosit acasă fără a-i spune numele, iar colegii încearcă să îl identifice." },
        { interval: "12:00-13:00", lead: "Lectură:", rest: "„O poveste despre grijă și ajutor”", explicatie: "Educatoarea citește o poveste scurtă, apoi copiii identifică gesturile prin care personajele se ajută." },
      ],
    },
    {
      ziua: "Joi",
      activitati: [
        { interval: "8:00-8:30", lead: "Primirea copiilor:", rest: "„Alegerea centrului preferat”", explicatie: "Copiii aleg un centru de interes și explică pe scurt alegerea făcută." },
        { interval: "8:30-9:00", lead: "Conversație:", rest: "„O regulă care ne ajută”", explicatie: "Grupul discută reguli simple care fac conviețuirea și colaborarea mai plăcute." },
        { interval: "9:00-10:30", lead: "Activitate de explorare:", rest: "„Obiecte și tradiții din familia mea”", explicatie: "Copiii observă obiecte sau imagini aduse de acasă și descriu asemănări și diferențe." },
        { interval: "11:00-12:00", lead: "Muzică și mișcare:", rest: "„Dansăm împreună”", explicatie: "Copiii urmează ritmul unei melodii și creează mișcări pe care le pot face în perechi sau în grup." },
        { interval: "12:00-13:00", lead: "Joc de masă:", rest: "„Potrivim membrii familiei”", explicatie: "Copiii grupează imagini după relații și alcătuiesc familii diferite, fără a impune un model unic." },
      ],
    },
    {
      ziua: "Vineri",
      activitati: [
        { interval: "8:00-8:30", lead: "Primirea copiilor:", rest: "„Săptămâna mea, pe scurt”", explicatie: "Copiii aleg o imagine care amintește de activitatea preferată din această săptămână." },
        { interval: "8:30-9:00", lead: "Întâlnirea de dimineață:", rest: "„Spun un mulțumesc”", explicatie: "Fiecare copil poate numi o persoană căreia dorește să îi mulțumească și motivul." },
        { interval: "9:00-10:30", lead: "Activitate integrată:", rest: "„Harta oamenilor dragi”", explicatie: "Copiii desenează persoane importante pentru ei și prezintă, dacă doresc, desenul grupului." },
        { interval: "11:00-12:00", lead: "Expoziție:", rest: "„Familia mea în culori”", explicatie: "Lucrările săptămânii sunt așezate într-o expoziție, iar copiii oferă feedback prin mesaje pozitive." },
        { interval: "12:00-13:00", lead: "Reflecție și joc liber:", rest: "„Ce duc cu mine acasă?”", explicatie: "Copiii aleg o idee sau o activitate pe care ar dori să o povestească acasă." },
      ],
    },
  ],
};

export async function GET() {
  const output = await buildPlanificareDocx(example);
  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="Exemplu-Planificare-Familia-mea.docx"',
      "Cache-Control": "no-store",
    },
  });
}
