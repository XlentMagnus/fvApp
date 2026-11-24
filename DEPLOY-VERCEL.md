# Driftsättning på Vercel + Turso (branch `vercel`)

Den här branchen kör appen som en serverless-funktion på Vercel med databasen hos
[Turso](https://turso.tech) (hostad SQLite). Lokalt fungerar allt som förut mot `db/fv_app.db`.

## Skillnader mot `main`

| | `main` (egen server) | `vercel` |
|---|---|---|
| Databas | SQLite-fil (better-sqlite3) | Turso via `@libsql/client` (lokalt: samma fil) |
| Inloggning | Session i SQLite | Signerad cookie (`cookie-session`) |
| Rate limiting | I minnet | I databasen (`login_failures`) |
| Mejlpåminnelser | Var 10:e minut | Vercel Cron 1 gång/dag (pass inom 30 h → "dagen innan") |
| Statiska filer | Express | Vercels CDN (`public/`) |
| Tidszon | Serverns | Låst till `Europe/Stockholm` i `config.js` |

## 1. Skapa databasen hos Turso

### Alternativ A – via Vercels Turso-integration (enklast)

1. Vercel → Storage → skapa en Turso-databas och koppla den till projektet.
   Vercel sätter då `TURSO_DATABASE_URL` och `TURSO_AUTH_TOKEN` automatiskt.
2. Hämta variablerna lokalt (filen ignoreras av git):
   ```bash
   vercel link
   vercel env pull .env.development.local
   ```
3. Kopiera din lokala databas (struktur + data) till Turso och kör migreringar:
   ```bash
   npm run db:copy-to-turso              # torrkörning – visar vad som kopieras
   npm run db:copy-to-turso -- --apply   # kopierar och verifierar antal rader
   npm run migrate:turso                 # kör eventuella nyare migreringar mot Turso
   ```
   Vill du börja tomt i stället: hoppa över kopieringen och kör bara `npm run migrate:turso`.

### Alternativ B – med Turso CLI

```bash
brew install tursodatabase/tap/turso    # eller se docs.turso.tech
turso auth login

# Ta med befintlig data: skriv WAL-loggen till databasfilen först
sqlite3 db/fv_app.db "PRAGMA wal_checkpoint(TRUNCATE);"
turso db create fv-app --from-file db/fv_app.db
#   (eller tom databas: turso db create fv-app  – kör sedan migrate nedan)

turso db show fv-app --url          # -> DATABASE_URL  (libsql://fv-app-<org>.turso.io)
turso db tokens create fv-app       # -> DATABASE_AUTH_TOKEN
```

Kör migreringar mot Turso (säkert att köra flera gånger – bara nya körs):

```bash
DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run migrate
```

## 2. Skapa projektet på Vercel

1. vercel.com/new → importera GitHub-repot.
2. **Settings → Git → Production Branch**: `vercel`.
3. Framework: Vercel känner igen Express automatiskt (`server.js` exporterar appen). Ingen build behövs.
4. **Settings → Environment Variables**:

| Variabel | Värde |
|---|---|
| `DATABASE_URL` | `libsql://fv-app-<org>.turso.io` (Tursos Vercel-integration sätter i stället `TURSO_DATABASE_URL` – fungerar också) |
| `DATABASE_AUTH_TOKEN` | token från Turso (eller `TURSO_AUTH_TOKEN`) |
| `SESSION_SECRET` | minst 32 slumpade tecken: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV` | `production` |
| `CRON_SECRET` | slumpad sträng (Vercel skickar den till cron-endpointen) |
| `APP_URL` | `https://<ditt-projekt>.vercel.app` (eller egen domän) |
| `CONTACT_NAME` | t.ex. `Förnamn Efternamn` (bemanningsansvarig) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | för mejlpåminnelser (se `.env.example`) |

5. Deploya. **Miljövariabler gäller först efter en ny deploy** (Deployments → ⋯ → Redeploy).
   Saknas något visar appen en sida som listar exakt vilka variabler som behövs.

## 3. Mejlpåminnelser (Vercel Cron)

`vercel.json` kör `GET /api/cron/reminders` kl. 15:00 UTC (16–17 svensk tid) varje dag. På Hobby-planen
kan jobbet starta när som helst inom den timmen. Varje körning skickar påminnelser för pass som börjar
inom 30 timmar och inte redan fått en – så alla får sin påminnelse ungefär dagen innan.

Med Pro-planen (eller Vercels nyare *Schedules*) kan det köras oftare: ändra `schedule` i `vercel.json`
och sätt `REMINDER_SCHEDULE=continuous` + `REMINDER_HOURS_BEFORE=24`.

## 4. Före lansering – checklista

- [ ] Byt lösenord på demo-administratörerna (`anna@example.com`, `anna.lindgren@email.se` har `password123`)
      eller skapa ett eget admin-konto och inaktivera dem.
- [ ] `APP_URL` pekar på den publika adressen (används i mejl- och kalenderlänkar).
- [ ] Testa en personlig länk och en kalenderprenumeration från mobilen.

## Lokalt på den här branchen

```bash
npm install
npm run migrate        # mot db/fv_app.db
npm run dev            # http://localhost:3000 – påminnelser var 10:e minut som förut
```
