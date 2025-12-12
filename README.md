# Global Meeting Time Helper

A static, single-page tool to help schedule meetings across multiple time zones and generate GitHub-friendly poll text.

You can host it directly on GitHub Pages. There is no backend: everything runs in the browser.

---

## What it does

- Lets you pick cities from a precomputed list (`data/timezones-filtered.json`) via autocomplete.
- Groups people by time zone (multiple cities can share a zone).
- Lets you assign a **weight** (number of people) to each time zone.
- Suggests **meeting times** that minimise pain across participants, taking into account:
  - Typical “working hours” vs early/late/night hours.
  - The number of people in each time zone.
- Suggests an optional **organizer’s chosen time** based on your local timezone.
- Generates **Markdown** suitable for a GitHub issue comment:
  - Two automatically chosen options.
  - An optional **organizer’s chosen time** as a third option.
  - Both **24-hour** and **12-hour** formats for each city.
  - Explicit **Daylight Savings** information and warnings.

---

## Data model

### Cities / time zones

Runtime data is loaded from:

- `data/timezones-filtered.json`

Each entry looks like:

```json
{
  "city": "Ottawa",
  "tz": "America/Toronto",
  "countryName": "Canada",
  "countryCode": "CA",
  "lat": 45.4215,
  "lon": -75.6972,
  "observesDst": true
}
```

The app normalises this to an internal structure:

- `slug`: URL slug (e.g. `ottawa_ca`)
- `name`: city name (`"Ottawa"`)
- `country`: country code or name (`"CA"`)
- `tz`: IANA time zone (`"America/Toronto"`)
- `lat`, `lon`: approximate coordinates
- `observesDst`: `true`/`false`
- `people`: integer, default 1

Cities with the same `tz` are effectively part of the same time-zone “bucket”. The UI still shows a city name, but the scoring is per time zone.

---

## URL format

State is encoded in the URL hash so you can paste links into GitHub issues or chats.

Example:

```text
#/utc/auckland_nz/tokyo_jp:7/paris_fr/calgary_ca:2/ottawa_ca
```

Structure:

- `#/utc/` is a fixed prefix for now (the “utc” part is reserved for future extensions).
- Each segment after that is:
  - `slug` for a city/timezone, or
  - `slug:count` where `count > 1` is the number of people in that time zone.

Rules:

- If `people <= 1`, the `:count` suffix is omitted.
- If `people > 1`, it appears as `slug:people`.
- Cities are sorted roughly **east → west** (by longitude) whenever the list changes.

> Note: the chosen date/time itself is **not** encoded in the URL yet. That is a deliberate simplification for v1.

---

## UI and behaviour

### 1. Add cities

- Start typing in the **city input**.
- The autocomplete datalist is populated from `timezones-filtered.json`.
- When you select an exact city name, it is **auto-added**; you do not need to click “Add city”.
- The first time the page loads, the app will:
  - Try to detect your browser’s timezone (`USER_TZ`).
  - Find a representative city in that timezone.
  - Auto-add that city and suggest it in the input.
  - The assumption: the person configuring the poll will also be attending.

### 2. Time zones & participants table

Once at least one city is added, the **“Time zones and participants”** section appears.

For each row:

- **Timezone** (e.g. `America/Toronto`)
- **Example city** (e.g. `Ottawa`)
- **Country**
- **DST**: “Yes” or “No”
- **People**:
  - `−` / `+` buttons to decrease/increase.
  - The weight is reflected in the URL (`slug:7` for a city with 7 people).
- **Remove** button

If all participants share the same timezone, the suggestion logic still runs, but you will generally see perfectly “good” hours for that zone and clearly “bad” hours when you push it into the night.

### 3. Meeting parameters

- **Date (UTC, optional)**  
  - Leave empty to search “today” from a UTC perspective.
  - If set, all times (both UTC and local) are computed for that calendar date, including Daylight Savings offsets.

- **Set a specific time (in your timezone)**  
  - Checkbox.
  - When checked:
    - The time widget appears.
    - The time is interpreted in your browser’s timezone (e.g. `America/Toronto`).
    - The input is pre-filled with your local time rounded to the nearest hour.
    - This becomes the **third suggestion** (“organizer’s chosen time”).
  - When unchecked:
    - The time widget is hidden.
    - The third suggestion is not generated.

- **Length (minutes)**  
  - Simple select or number input.
  - Used to compute end times and scoring.

The app uses `Intl.DateTimeFormat` with a `timeZone` per city, so DST offsets for that date/time are handled by the browser.

### 4. Suggested meeting times

When at least two time zones are added, the **“Suggested meeting times”** section appears.

- The tool scans candidate UTC start times between 06:00 and 21:00 (by default).
- For each candidate, it:
  - Converts to local time for each city.
  - Evaluates each city as:
    - **good** (09:00–17:00)
    - **ok** (07:00–09:00 or 17:00–21:00)
    - **poor** (05:00–07:00 or 21:00–23:00)
    - **terrible** (everything else)
  - Scores **per city** based on that classification and multiplies by the `people` count.
  - Sums the score across cities.

The UI then shows:

- **Option A**, **Option B**: two best-scoring automatic slots.
- **Option C (organizer's chosen time)**: if the “Set time” checkbox is checked and a time is provided.
- For each option:
  - If a **date is chosen**:
    - `Start: YYYY-MM-DD HH:MM UTC; length N minutes.`
  - If **no date is chosen**:
    - The UI only shows the length (no synthetic date).

Per city, you see:

- Local time range in 24-hour (`09:00-10:00`) with “(different day)” when needed.
- Number of people.
- A badge:
  - “within 09:00-17:00”
  - “early/late but reasonable”
  - “quite painful”
  - “night hours”
- DST warnings when appropriate (see below).

---

## Daylight Savings handling

### Where it applies

DST awareness is only applied to zones in:

- `Europe/*`
- `America/*`

and only when `observesDst` is true for that city.

### What is displayed

For each DST-observing city:

- In the **GitHub Markdown**:
  - Always show a reminder of the DST rule, for example:
    - `Daylight Savings (Last Sunday in March & October)`
    - `Daylight Savings (Second Sunday in March & First Sunday in November)`
  - If the reference date (chosen date or today, if no date) is:
    - Within ~30 days before a DST change:  
      `_(Upcoming daylight savings change within about a month.)_`
    - Within the first week after a DST change:  
      `**This is in the first week after a daylight savings change.**`
- In the **Suggested meeting times** table:
  - The same “upcoming” or “first week after” messages appear in the “Comment” column for that city.

Internally, the app:

- Computes EU DST as “last Sunday in March & October”.
- Computes NA DST as “second Sunday in March & first Sunday in November”.
- Uses the selected date (if any) or today’s date as the **reference date** for these checks.
- Uses `Intl.DateTimeFormat` for actual local-time conversions at the meeting time.

---

## GitHub issue Markdown

Click “Copy Markdown” and paste into a GitHub issue comment. You will get something like:

```markdown
We are trying to schedule a call. Here are the proposed options:

1. **Option A**: 14:00 UTC (60 minutes)
   - Paris: 15:00-16:00 (3:00-4:00pm) - Daylight Savings (Last Sunday in March & October) _(Upcoming daylight savings change within about a month.)_
   - Ottawa: 09:00-10:00 (9:00-10:00am) - Daylight Savings (Second Sunday in March & First Sunday in November)
   - Vancouver: 06:00-07:00 (6:00-7:00am) - Daylight Savings (Second Sunday in March & First Sunday in November)

2. **Option B (organizer's chosen time)**: 20:00 UTC (60 minutes)
   - ...

Please vote by reacting to this comment:
- 👍 for Option A
- 👀 for Option B
- ❓ for Option C

_Generated by a static GitHub Pages tool. TODO: optional GitHub API integration._
```

All cities get both 24-hour and 12-hour representations, with DST reminders where applicable.

---

## Accessibility

The app is being developed with **WCAG 2.2 AA** in mind:

- High-contrast colour choices.
- Clear focus outlines.
- Logical heading structure.
- Form labels associated with inputs.
- ARIA live regions used for key dynamic content (e.g. error messages and suggestions).

You should still run automated checks (axe, Lighthouse, etc.) and manual testing to validate against your own criteria.

---

## Running locally

Requirements:

- Any modern browser with:
  - `Intl.DateTimeFormat` time zone support.
  - ES2015+ JavaScript.

Steps:

1. Clone the repository.
2. Ensure `data/timezones-filtered.json` exists (and matches the expected structure).
3. From the project root, start a simple HTTP server, for example:

   ```sh
   python3 -m http.server 8000
   ```

4. Open:

   ```text
   http://localhost:8000/
   ```

---

## Deploying to GitHub Pages

1. Push the project to GitHub.
2. In the repository settings, enable **GitHub Pages**:
   - Source: `main` (or your chosen branch).
   - Folder: `/` (root) if you keep `index.html` at the top level.
3. After Pages builds, your app will be available at:

   ```text
   https://<your-username>.github.io/<your-repo>/
   ```

You can share fully-encoded scheduling links directly in GitHub issues or any other context.

---

## Future work

Planned improvements:

- Encode the chosen date/time and organizer timezone into the URL.
- Optional integration with the **GitHub API** to:
  - Comment directly on issues.
  - Update polls when participants change.
- More explicit configuration of “acceptable” work hours per region.
- Better visualisation (e.g. a light/dark world map) tied to the selected times.

## AI Disclosure

Yes. AI was used in creating this tool. There be dragons! 

Contributions and suggestions are welcome.
