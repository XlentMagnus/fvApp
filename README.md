# FöreningsVerktyg (FV App)

Planeringsverktyg för föreningar – hantera arbetsuppgifter, tilldela personer och följ upp status.

## Funktioner

- **Dashboard** med statistik och snabbåtgärder
- **Kalendervy** (månad + vecka) med färgkodade kategorier
- **Uppgiftshantering** – skapa, redigera, tilldela personer
- **Personhantering** – CRUD med roller (admin/användare)
- **Mina uppgifter** – acceptera, neka, kommentera, markera klart
- **Publik översikt med personliga länkar** – medlemmar anmäler/avanmäler sig själva utan lösenord
- **Ändringslogg** – vem anmälde/avanmälde/ändrade vad och när, med möjlighet att ångra
- **Session-baserad autentisering** för administratörer, med bcrypt-hashade lösenord
- **Responsiv design** med dark mode (Tailwind CSS)
- **SQLite-databas** med migrations

## Tech stack

| Lager     | Teknik                          |
|-----------|---------------------------------|
| Backend   | Node.js, Express                |
| Databas   | SQLite (better-sqlite3)         |
| Frontend  | HTML, Tailwind CSS, Vanilla JS  |
| Auth      | express-session, bcrypt         |

## Kom igång

### Förutsättningar

- Node.js 18+
- npm

### Installation

```bash
git clone <repo-url>
cd FV_app
npm install
```

### Setup databas

```bash
npm run setup
```

Detta kör migrations och seedar databasen med exempeldata.

### Bygg CSS (vid ändringar)

```bash
npm run build:css
```

### Starta servern

```bash
npm run dev
```

Öppna http://localhost:3000 i din webbläsare.

### Inloggningsuppgifter (seed-data)

| Roll   | E-post                  | Lösenord    |
|--------|-------------------------|-------------|
| Admin  | anna@example.com        | password123 |
| User   | erik.holmberg@email.se  | password123 |

> `npm run seed` raderar all data. Det vägrar köra om databasen redan innehåller personer
> (använd `npm run seed -- --force`) och körs aldrig när `NODE_ENV=production`.

## Personliga länkar (medlemmar)

Medlemmar behöver inget konto eller lösenord. Varje person får en hemlig, personlig länk:

```
https://<din-domän>/oversikt?k=<32 tecken>
```

- Första gången länken öppnas sparas den i webbläsaren – sedan räcker det att gå till `/oversikt`.
- Med länken kan personen **bara anmäla och avanmäla sig själv**.
- Utan länk kan man se kalendern (namn på anmälda), men inte ändra något. Telefonnummer visas aldrig publikt.
- Admin hittar länken under **Personer → (person) → Personlig länk**, kan skicka den via SMS/e-post
  eller **Exportera länkar** som CSV för massutskick.
- Har en länk spridits: klicka **Ny länk** – den gamla slutar fungera direkt.

## Kalender och mejlpåminnelser (medlemmar)

På sin personliga sida kan medlemmen:

- **📅 Lägg till i min kalender** – prenumerera på en personlig kalender (iPhone/Mac/Outlook via `webcal://`,
  eller Google Kalender). Den uppdateras automatiskt när man anmäler/avanmäler sig. Varje pass kan också
  laddas ner som en enskild `.ics`-fil.
- **✉️ Vill du ha en påminnelse via mejl? Klicka här!** – slår på mejlpåminnelser (opt-in). Ett bekräftelsemejl
  skickas direkt, och sedan ett mejl ca `REMINDER_HOURS_BEFORE` timmar (standard 24) före varje pass.
  Ett bakgrundsjobb kollar var 10:e minut; varje anmälan får högst en påminnelse.

Mejl kräver SMTP-inställningar (`SMTP_HOST` m.fl., se `.env.example`). Utan dem skrivs mejlen bara ut i
serverloggen. `APP_URL` måste vara appens publika adress så att länkar i mejl och kalendrar fungerar.

## Platser som kräver skoterkort

Ett pass (och en mall) har **Antal platser** och **Varav platser som kräver skoterkort**. Exempel:
Liftvärd – 2 platser, varav 1 kräver skoterkort. Personer utan skoterkort kan ta en plats så länge
det finns kvar tillräckligt många platser för skoterkortskravet; annars måste de bekräfta att de ändå
kan bemanna passet. Automatisk fördelning fyller skoterkortsplatserna med personer som har skoterkort.

Befintliga pass "Liftvärd 1 / Skoterförare" + "Liftvärd 2" slås ihop med
`node db/scripts/merge-lift-tasks.js` (torrkörning) och `... --apply` (tar backup i `db/backups/` först).

## Automatisk fördelning av pass (admin)

**Uppgifter → ⚡ Fördela pass automatiskt.** Välj period, vilka personer som kan få pass och kompetenskrav
per kategori (t.ex. Kioskpass → Kiosk). Pass markerade "kräver skoterkort" kräver alltid skoterkort.

- Bara personer med rätt kompetens får ett pass, ingen bokas på överlappande tider och (valfritt) max ett pass per dag.
- De svåraste passen (färst personer med rätt kompetens) fördelas först; varje plats går till den med minst
  antal pass i perioden. Ett utjämningssteg flyttar sedan pass i kedjor så att skillnaden blir så liten som möjligt.
- Du ser ett förslag (per person och per pass) och kan bocka ur enskilda tilldelningar innan du sparar.
- Allt loggas i **Logg** ("Automatisk fördelning") och kan ångras där.

API: `POST /api/auto-assign/preview` `{ from, to, user_ids?, max_per_day? }` och
`POST /api/auto-assign/apply` `{ from, to, pairs: [{task_id, user_id}], max_per_day? }`.

## Logg

Under **Logg** (admin) syns alla anmälningar, avanmälningar och admin-ändringar. Anmälningar och
avanmälningar kan ångras med ett klick.

## Projektstruktur

```
/app
  /routes          - Express-routes
  /controllers     - Request/response-hantering
  /services        - Affärslogik
  /repositories    - Databasanrop
  /middleware       - Auth, error handling
/public
  /css             - Tailwind (input + compiled)
  /js              - Klient-JavaScript (SPA)
  oversikt.html    - Startsida (publik översikt, `/`)
  admin.html       - Admin-appen (`/admin`)
/db
  /migrations      - SQL-migrationsfiler
  /seed            - Seed-script
  connection.js    - SQLite-anslutning
  migrate.js       - Migration runner
```

## API

### Auth
- `POST /api/auth/login` – Logga in
- `POST /api/auth/logout` – Logga ut
- `GET /api/auth/me` – Aktuell användare

### Users (admin)
- `GET /api/users` – Lista alla
- `POST /api/users` – Skapa
- `PUT /api/users/:id` – Uppdatera
- `DELETE /api/users/:id` – Ta bort

### Tasks
- `GET /api/tasks` – Lista alla
- `GET /api/tasks/stats` – Statistik
- `GET /api/tasks/calendar?from=&to=` – Kalenderdata
- `GET /api/tasks/my` – Mina uppgifter
- `POST /api/tasks` – Skapa (admin)
- `PUT /api/tasks/:id` – Uppdatera (admin)
- `DELETE /api/tasks/:id` – Ta bort (admin)
- `POST /api/tasks/:id/assign` – Tilldela (admin)

### Users – personliga länkar (admin)
- `POST /api/users/:id/regenerate-link` – Skapa ny länk (den gamla slutar gälla)

### Assignments
- `PUT /api/assignments/:id` – Uppdatera status/kommentar (bara egna, eller admin)

### Publikt (översikten)
Läsning är öppen. Ändringar kräver headern `X-Member-Key: <personlig nyckel>`.
- `GET /api/public/calendar?from=&to=` – Kalender (endast namn på anmälda)
- `GET /api/public/tasks/:id` – Uppgift med anmälda (endast namn)
- `GET /api/public/stats` – Statistik
- `GET /api/public/me` – Medlemmen bakom nyckeln + kommande pass *(kräver nyckel)*
- `POST /api/public/tasks/:id/signup` – Anmäl mig *(kräver nyckel)*
- `POST /api/public/tasks/:id/unsign` – Avanmäl mig *(kräver nyckel, senast `UNSIGN_MIN_HOURS` före start)*
- `POST /api/public/me/reminders` – `{ "enabled": true|false }` mejlpåminnelser *(kräver nyckel)*
- `GET /api/public/ical/<nyckel>.ics` – Personlig kalenderprenumeration
- `GET /api/public/tasks/:id.ics` – Ett pass som kalenderfil

### Logg (admin)
- `GET /api/audit` – Senaste händelserna
- `POST /api/audit/:id/undo` – Ångra en anmälan/avanmälan

### Categories
- `GET /api/categories` – Lista alla
- `POST /api/categories` – Skapa (admin)

## Environment-variabler

Se `.env.example` för alla tillgängliga variabler. I produktion **måste** `SESSION_SECRET` vara satt
(minst 32 tecken) – annars startar inte appen. Kör appen bakom HTTPS och sätt `TRUST_PROXY=1` om den
ligger bakom en reverse proxy.
