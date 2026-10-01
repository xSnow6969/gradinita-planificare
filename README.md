# Planificare Grădiniță

Generează o săptămână de activități, editează ideile și descarcă documente separate pentru fiecare zi.

## Pornire

```bash
npm install
npm run dev
```

Deschide http://localhost:3000. Contul implicit este `stefi` / `profesoara`; poate fi schimbat prin `APP_USERNAME` și `APP_PASSWORD`.

La prima intrare apare fereastra **Setări AI**. Pentru producție este recomandat să configurezi cheile pe server, prin variabile de mediu, nu în browser. `AI_PROVIDER=auto` încearcă Groq, apoi Gemini, ca să folosească mai bine free tier-ul. Pentru Groq și Gemini poți pune mai multe chei separate prin virgulă:

```env
AI_PROVIDER=auto
GROQ_API_KEYS=gsk_...
GEMINI_API_KEYS=...
GROQ_MODEL=openai/gpt-oss-120b
GEMINI_MODEL=gemini-2.5-flash-lite
```

Poți folosi și Claude cu `AI_PROVIDER=claude` și `ANTHROPIC_API_KEY`. Dacă salvezi o cheie din interfață, se reține 30 de zile într-un cookie HttpOnly, SameSite=Strict, limitat la `/api`. Valoarea nu este returnată de API-ul de setări și nu se salvează în localStorage. Pe HTTPS cookie-ul este Secure. Planul se generează câte o zi odată.

Nu urca `.env.local` pe GitHub. Fișierul este ignorat de git; folosește `.env.example` ca model fără secrete.

## Deploy pe Vercel

1. Urcă proiectul pe GitHub.
2. În Vercel, alege **Add New Project**, importă repo-ul și păstrează framework-ul **Next.js**.
3. În **Settings -> Environment Variables**, adaugă cel puțin:

```env
APP_USERNAME=stefi
APP_PASSWORD=o-parola-schimbata
AI_PROVIDER=auto
GROQ_API_KEYS=...
GEMINI_API_KEYS=...
GROQ_MODEL=openai/gpt-oss-120b
GEMINI_MODEL=gemini-2.5-flash-lite
```

4. Dacă vrei istoric persistent al ideilor între deploy-uri, adaugă și `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN`.
5. Apasă **Deploy**. Vercel rulează `npm run build` automat.

## Planificare și documente

Structura urmărește modelul local `planificare s3.pdf`: ziua, intervalul orar și activitățile de învățare. Intervalele sunt 8:00–8:30, 8:30–9:00, 9:00–10:30, 11:00–12:00 și 12:00–13:00. Pauza dintre 10:30 și 11:00 este păstrată ca în model.

AI-ul propune joc liber și explorare individuală, rutine, întâlnirea de dimineață, ADE, centre ALA, mișcare și masa de prânz. Fiecare activitate are un ghid cu materiale, pași și durată. Generarea se face pe zile, cu reîncercare automată pentru erori temporare de provider, iar rezultatul final trebuie să conțină toate cele cinci zile și toate intervalele.

Planificarea și modificările se salvează automat în localStorage pe acest browser. Nu reprezintă o arhivă pe server și nu se sincronizează între dispozitive. Cheia API nu face parte din planificarea salvată.

În secțiunea **Documente pentru fiecare zi**, selectează ziua (sau săptămâna completă) și documentul:

- **Planificare**: tabel cu zi, interval și titlurile activităților.
- **Ghid practic**: instrucțiunile detaliate pentru activitățile zilei.

Apasă **Previzualizează**, apoi alege **PDF** sau **Word (.docx)**. Fiecare zi se descarcă în fișier separat. Documentele folosesc modificările curente; previzualizarea reprezintă o copie a lor la momentul deschiderii. Pentru actualizare, închide previzualizarea, editează și redeschide-o.

## Windows și Microsoft Office

Aplicația poate rula pe Windows, macOS sau Linux cu Node.js 22 sau mai nou. Pe Windows, deschide PowerShell în folderul proiectului și rulează aceleași comenzi `npm install`, apoi `npm run dev`. Nu copia `node_modules` de pe alt sistem: instalează dependențele local. Pentru producție: `npm run build`, apoi `npm run start`.

Fișierele Word sunt documente `.docx` editabile în Microsoft Word. PDF-urile pot fi deschise în Microsoft Edge sau Adobe Acrobat Reader. Utilizarea site-ului și generarea fișierelor nu necesită instalarea Microsoft Office ori LibreOffice pe server.

PDF-ul este creat direct în JavaScript cu `pdf-lib`, cu fonturile DejaVu incluse în `assets/fonts` și încorporate în PDF pentru diacritice. Fonturile sunt incluse explicit în fișierele de deployment Next.js. Previzualizarea arată exact PDF-ul descărcat; Word folosește aceleași date, dar poate avea o paginare diferită. Niciun proces extern sau director temporar nu este necesar pentru export.

## Istoricul ideilor

Istoricul folosește Upstash dacă sunt configurate `UPSTASH_REDIS_REST_URL` și `UPSTASH_REDIS_REST_TOKEN`, altfel memoria procesului. Acest istoric este transmis AI-ului pentru a reduce repetițiile; nu garantează eliminarea tuturor ideilor similare. Este separat de planificarea locală salvată în browser.

## Verificări

```bash
npm run build
npm run start -- --port 3100
# În alt terminal (pdftotext este opțional, pentru verificarea textului):
node scripts/check-documents.mjs
```

Scriptul verifică cookie-urile, respingerea datelor invalide, exporturile PDF/Word și paginarea documentelor lungi. Dacă `pdftotext` este instalat, verifică și textul, inclusiv diacriticele. Utilizează o cheie fictivă și nu apelează furnizorii AI. Scrie documente de probă într-un director temporar și afișează calea lui. Testele automate nu înlocuiesc o verificare manuală în Microsoft Word.
