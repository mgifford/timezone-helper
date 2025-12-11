# Installation and Local Setup

This document describes how to run the Global Meeting Time Helper locally and deploy it to GitHub Pages.

## Requirements

- Any modern browser with:
  - `Intl.DateTimeFormat` time zone support.
  - ES2015+ JavaScript.
- A simple static file server (for local testing), for example:
  - Python's `http.server`
  - `npx serve`
  - Any other static HTTP server of your choice.

## Project layout

Relevant files:

- `index.html` – main single-page application.
- `styles.css` – styling.
- `app.js` – application logic.
- `data/timezones-filtered.json` – city/time zone data with:
  - `city`
  - `tz` (IANA time zone, e.g. `America/Toronto`)
  - `countryName` / `countryCode`
  - `lat`, `lon`
  - `observesDst`

## Running locally

1. Clone the repository:

   ```sh
   git clone <your-repo-url>.git
   cd <your-repo>
   ```

2. Verify that `data/timezones-filtered.json` exists and has the expected structure.

3. Start a static HTTP server in the project root. Examples:

   Using Python 3:

   ```sh
   python3 -m http.server 8000
   ```

   Using Node (if you have `serve` installed):

   ```sh
   npx serve . -l 8000
   ```

4. Open the app in your browser:

   ```text
   http://localhost:8000/
   ```

5. Add some cities, adjust participant counts, set a date/time if needed, and copy the generated GitHub Markdown.

## Deploying to GitHub Pages

1. Push your code to GitHub if you have not already:

   ```sh
   git add .
   git commit -m "Initial commit of Global Meeting Time Helper"
   git push origin main
   ```

2. In your repository on GitHub, go to **Settings → Pages**:

   - **Source**: choose `main` (or your default branch).
   - **Folder**: select `/ (root)` if `index.html` is in the repository root.

3. Save the settings and wait for GitHub Pages to build the site.

4. Your application will be served at:

   ```text
   https://<your-username>.github.io/<your-repo>/
   ```

5. Test that:

   - The city autocomplete works (data loads from `data/timezones-filtered.json`).
   - URLs like `#/utc/ottawa_ca/london_gb` correctly restore the chosen cities.
   - Suggested meeting times and GitHub Markdown generation behave as expected.

## Updating data

If you want to refresh or adjust the list of cities/time zones:

1. Update `data/timezones-filtered.json` with the desired entries.
2. Make sure each entry has:
   - A valid IANA time zone string in `tz`.
   - Reasonable `lat` / `lon` values.
   - `observesDst` correctly set for areas using Daylight Savings.
3. Redeploy to GitHub Pages (push your changes).

## Troubleshooting

- **City autocomplete is empty**  
  Check the browser console for errors loading `data/timezones-filtered.json`. Verify the path and JSON syntax.

- **Times look wrong around Daylight Savings**  
  The app relies on your browser's time zone data and `Intl.DateTimeFormat`. Make sure:
  - Your system timezone is correctly configured.
  - Your browser is up to date.

- **GitHub Pages shows a 404**  
  Double-check that:
  - GitHub Pages is pointed at the branch and folder where `index.html` lives.
  - The repository is public, or you are accessing it via the correct URL for a private or org site.

If issues persist, check the browser console for JavaScript errors and adjust the data or paths accordingly.
