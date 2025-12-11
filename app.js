// Configuration
const CITIES_URL = "data/timezones-filtered.json";
const STORAGE_KEY = "global-meeting-helper-v1";

// In-memory state
let allCities = [];              // all cities from JSON
let allCitiesByNameLower = {};   // name.toLowerCase() -> city object
let citiesInPoll = [];           // selected cities (time zones / cities)

// User timezone
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Utility
function pad2(n) {
  return n.toString().padStart(2, "0");
}

function showError(msg) {
  const el = document.getElementById("loadError");
  el.textContent = msg;
  el.style.display = "block";
}

function clearError() {
  const el = document.getElementById("loadError");
  el.textContent = "";
  el.style.display = "none";
}

function slugifyCity(name, countryCode) {
  if (!name) {
    name = "city";
  }
  let s = String(name).trim().toLowerCase();

  // remove common apostrophes
  s = s.replace(/['’]/g, "");

  // replace non alphanumerics with a single underscore
  let out = [];
  let prevUnderscore = false;
  for (const ch of s) {
    if (/[a-z0-9]/.test(ch)) {
      out.push(ch);
      prevUnderscore = false;
    } else {
      if (!prevUnderscore) {
        out.push("_");
        prevUnderscore = true;
      }
    }
  }
  let slug = out.join("").replace(/^_+|_+$/g, "");
  if (!slug) {
    slug = "city";
  }
  if (countryCode) {
    slug += "_" + String(countryCode).toLowerCase();
  }
  return slug;
}

// Optional: show user timezone + UTC offset in UI if there is an element for it.
function getUserTimezoneOffsetLabel() {
  try {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: USER_TZ,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit"
    });
    const parts = dtf.formatToParts(now);
    const tzPart = parts.find(p => p.type === "timeZoneName");
    if (!tzPart) return "UTC";
    // Example values are like "GMT-5" or "UTC+1"
    return tzPart.value.replace("GMT", "UTC");
  } catch (e) {
    return "UTC";
  }
}

function initUserTimezoneInfo() {
  const offsetLabel = getUserTimezoneOffsetLabel();

  // Optional info block, if you have <div id="userTimezoneInfo"></div>
  const infoEl = document.getElementById("userTimezoneInfo");
  if (infoEl) {
    infoEl.textContent = `Your timezone: ${USER_TZ} (${offsetLabel})`;
  }

  // Update the label for the time input
  const timeLabel = document.querySelector("label[for='timeInput']");
  if (timeLabel) {
    timeLabel.textContent = `Time (${USER_TZ}, ${offsetLabel}, optional)`;
  }
}

// 1. Load cities JSON based on new structure
async function loadCitiesJson() {
  try {
    const res = await fetch(CITIES_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " while loading " + CITIES_URL);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("timezones-with-latlon file must be an array");
    }

    allCities = data.map(entry => {
      const name = entry.city || entry.tz || "Unknown";
      const countryCode = entry.countryCode || "";
      const country = countryCode || entry.country || "";
      const tz = entry.tz || entry.timezone || "";
      const observesDst = typeof entry.observesDst === "boolean"
        ? entry.observesDst
        : String(entry.observesDst || "").toLowerCase() === "yes";

      const lat = typeof entry.lat === "number" ? entry.lat : 0;
      const lon = typeof entry.lon === "number" ? entry.lon : 0;

      return {
        slug: slugifyCity(name, countryCode),
        name: String(name),
        country: String(country),
        tz: String(tz),
        lat,
        lon,
        observesDst,
        people: 1
      };
    });

    // index by case-insensitive name for autocomplete lookup
    allCitiesByNameLower = {};
    allCities.forEach(c => {
      const key = c.name.toLowerCase();
      allCitiesByNameLower[key] = c;
    });

    populateCityDatalist();
    clearError();
  } catch (e) {
    console.error(e);
    showError("Failed to load " + CITIES_URL + ": " + e.message);
  }
}

// 2. Autocomplete list
function populateCityDatalist() {
  const dl = document.getElementById("cityDatalist");
  dl.innerHTML = "";
  allCities.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    dl.appendChild(opt);
  });
}

// 3. URL hash handling (uses slug)
function updateHashFromCities() {
  if (!citiesInPoll.length) {
    window.location.hash = "";
    return;
  }

  const segments = citiesInPoll.map(c => {
    const people = Number(c.people) || 0;
    // Only include :N when N > 1
    if (people > 1) {
      return `${c.slug}:${people}`;
    }
    return c.slug;
  });

  const hash = "#/utc/" + segments.join("/");
  window.location.hash = hash;
}

function parseHash() {
  const hash = window.location.hash || "";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);

  if (!parts.length) {
    return { reference: "utc", items: [] };
  }

  const [reference, ...citySegments] = parts;

  const items = citySegments.map(seg => {
    // format: slug or slug:count
    const [slug, countStr] = seg.split(":");
    let people = null;
    if (countStr !== undefined) {
      const n = parseInt(countStr, 10);
      if (Number.isFinite(n) && n > 1) {
        people = n;
      }
    }
    return { slug, people };
  });

  return {
    reference: reference || "utc",
    items
  };
}

function loadCitiesFromHash() {
  const { items } = parseHash();
  const result = [];

  for (const item of items) {
    const base = allCities.find(c => c.slug === item.slug);
    if (!base) continue;

    const clone = { ...base };

    if (item.people && item.people > 1) {
      clone.people = item.people;
    } else {
      clone.people = 1;
    }

    result.push(clone);
  }

  // sort east -> west
  result.sort((a, b) => b.lon - a.lon);
  citiesInPoll = result;
}

// 4. City add/remove

// Standard add with error messaging (used by button / form submit)
function addCityByName(nameRaw) {
  const name = (nameRaw || "").trim();
  const errEl = document.getElementById("addCityError");

  if (!name) {
    errEl.textContent = "Please type a city name.";
    errEl.style.display = "block";
    return;
  }

  const city = allCitiesByNameLower[name.toLowerCase()];
  if (!city) {
    errEl.textContent = `No city named "${name}" found in data.`;
    errEl.style.display = "block";
    return;
  }

  const already = citiesInPoll.find(c => c.slug === city.slug);
  if (already) {
    errEl.textContent = `"${city.name}" is already in the list.`;
    errEl.style.display = "block";
    return;
  }

  errEl.textContent = "";
  errEl.style.display = "none";

  const clone = { ...city, people: 1 };
  citiesInPoll.push(clone);
  citiesInPoll.sort((a, b) => b.lon - a.lon);

  updateHashFromCities();
  renderCitiesTable();
  renderSuggestions();
  saveStateToStorage();
}

// Auto-add for datalist selection / change, no errors or messages
function autoAddCityIfExactMatch(nameRaw) {
  const name = (nameRaw || "").trim();
  if (!name) return;

  const city = allCitiesByNameLower[name.toLowerCase()];
  if (!city) return;

  const already = citiesInPoll.find(c => c.slug === city.slug);
  if (already) return;

  const clone = { ...city, people: 1 };
  citiesInPoll.push(clone);
  citiesInPoll.sort((a, b) => b.lon - a.lon);

  updateHashFromCities();
  renderCitiesTable();
  renderSuggestions();
  saveStateToStorage();
}

function removeCity(slug) {
  citiesInPoll = citiesInPoll.filter(c => c.slug !== slug);
  updateHashFromCities();
  renderCitiesTable();
  renderSuggestions();
  saveStateToStorage();
}

// 5. Date / time helpers
function parseDateTimeSettings() {
  const dateStr = document.getElementById("dateInput").value;   // "" or YYYY-MM-DD
  const timeStr = document.getElementById("timeInput").value;   // "" or HH:MM

  let dateInfo = null;
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    dateInfo = { year: y, month: m, day: d };
  }

  let timeInfo = null;
  if (timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    timeInfo = { hour: hh || 0, minute: mm || 0 };
  }

  return { dateInfo, timeInfo };
}

function buildUtcDate(dateInfo, hour, minute) {
  if (dateInfo) {
    // Interpreting date as UTC calendar date for now; algorithm is UTC-based.
    return new Date(Date.UTC(dateInfo.year, dateInfo.month - 1, dateInfo.day, hour, minute));
  } else {
    const today = new Date();
    return new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      hour,
      minute
    ));
  }
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function localTimeParts(dateUtc, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(dateUtc);
  const obj = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      obj[p.type] = p.value;
    }
  }
  return {
    year: parseInt(obj.year, 10),
    month: parseInt(obj.month, 10),
    day: parseInt(obj.day, 10),
    hour: parseInt(obj.hour, 10),
    minute: parseInt(obj.minute, 10)
  };
}

// 24-hour range used in UI tables
function formatLocalRange24(city, startUtc, meetingMinutes) {
  const startLocal = localTimeParts(startUtc, city.tz);
  const endLocal = localTimeParts(addMinutes(startUtc, meetingMinutes), city.tz);

  const s = `${pad2(startLocal.hour)}:${pad2(startLocal.minute)}`;
  const e = `${pad2(endLocal.hour)}:${pad2(endLocal.minute)}`;

  const sameDay =
    startLocal.year === endLocal.year &&
    startLocal.month === endLocal.month &&
    startLocal.day === endLocal.day;

  if (sameDay) {
    return `${s}-${e}`;
  }
  return `${s}-${e} (different day)`;
}

// 12-hour helper for markdown
function to12hParts(hour, minute) {
  let suffix = hour < 12 ? "am" : "pm";
  let h = hour % 12;
  if (h === 0) h = 12;
  return { h, minute: pad2(minute), suffix };
}

// Combined 24h + 12h range for markdown
function formatLocalRange24and12(city, startUtc, meetingMinutes) {
  const startLocal = localTimeParts(startUtc, city.tz);
  const endLocal = localTimeParts(addMinutes(startUtc, meetingMinutes), city.tz);

  const s24 = `${pad2(startLocal.hour)}:${pad2(startLocal.minute)}`;
  const e24 = `${pad2(endLocal.hour)}:${pad2(endLocal.minute)}`;

  const sameDay =
    startLocal.year === endLocal.year &&
    startLocal.month === endLocal.month &&
    startLocal.day === endLocal.day;

  const start12 = to12hParts(startLocal.hour, startLocal.minute);
  const end12 = to12hParts(endLocal.hour, endLocal.minute);

  let range12;
  if (start12.suffix === end12.suffix) {
    // 6:00-7:00am
    range12 = `${start12.h}:${start12.minute}-${end12.h}:${end12.minute}${start12.suffix}`;
  } else {
    // 11:30pm-1:00am
    range12 = `${start12.h}:${start12.minute}${start12.suffix}-${end12.h}:${end12.minute}${end12.suffix}`;
  }

  let combined = `${s24}-${e24} (${range12})`;
  if (!sameDay) {
    combined += " (different day)";
  }
  return combined;
}

// 6. Scoring
function classifyHour(hour) {
  if (hour >= 9 && hour < 17) return "good";
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 21)) return "ok";
  if ((hour >= 5 && hour < 7) || (hour >= 21 && hour < 23)) return "poor";
  return "terrible";
}

function costForSlot(city, startUtc, meetingMinutes) {
  const startLocal = localTimeParts(startUtc, city.tz);
  const endLocal = localTimeParts(addMinutes(startUtc, meetingMinutes), city.tz);
  const hoursToCheck = [startLocal.hour, endLocal.hour];

  let raw = 0;
  for (const hour of hoursToCheck) {
    const cat = classifyHour(hour);
    if (cat === "good") raw += 0;
    else if (cat === "ok") raw += 1;
    else if (cat === "poor") raw += 3;
    else raw += 6;
  }
  const people = Math.max(1, city.people || 1);
  return raw * people;
}

function scoreSlot(cities, startUtc, meetingMinutes) {
  let score = 0;
  for (const city of cities) {
    score += costForSlot(city, startUtc, meetingMinutes);
  }
  return score;
}

function generateSuggestions(cities) {
  const lengthMinutes = parseInt(document.getElementById("lengthInput").value, 10) || 60;
  const numSuggestions = 2; // fixed for now

  const { dateInfo, timeInfo } = parseDateTimeSettings();

  const slots = [];
  const baseMinute = timeInfo ? timeInfo.minute : 0;

  // Always search between 06:00 and 21:00 UTC
  for (let hour = 6; hour <= 21; hour++) {
    const startUtc = buildUtcDate(dateInfo, hour, baseMinute);
    const score = scoreSlot(cities, startUtc, lengthMinutes);
    slots.push({ startUtc, score });
  }

  slots.sort((a, b) => a.score - b.score);
  const chosen = slots.slice(0, numSuggestions);
  return { slots: chosen, lengthMinutes };
}

// 7. Card visibility
function updateCardsVisibility() {
  const hasCities       = citiesInPoll.length >= 1;
  const hasEnoughCities = citiesInPoll.length >= 2;

  const cardTimezones   = document.getElementById("cardTimezones");
  const cardSuggestions = document.getElementById("cardSuggestions");
  const cardMarkdown    = document.getElementById("cardMarkdown");

  if (cardTimezones) {
    cardTimezones.style.display = hasCities ? "block" : "none";
  }
  if (cardSuggestions) {
    cardSuggestions.style.display = hasEnoughCities ? "block" : "none";
  }
  if (cardMarkdown) {
    cardMarkdown.style.display = hasEnoughCities ? "block" : "none";
  }
}

// 8. Rendering cities table
function renderCitiesTable() {
  const tbody = document.querySelector("#citiesTable tbody");
  tbody.innerHTML = "";

  if (!citiesInPoll.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No time zones added yet.";
    td.className = "muted";
    tr.appendChild(td);
    tbody.appendChild(tr);
    updateCardsVisibility();
    return;
  }

  citiesInPoll.forEach(city => {
    const tr = document.createElement("tr");

    // Time zone (primary)
    const tdTz = document.createElement("td");
    tdTz.textContent = city.tz;
    tr.appendChild(tdTz);

    // Example city name (secondary)
    const tdName = document.createElement("td");
    tdName.textContent = city.name;
    tr.appendChild(tdName);

    // Country
    const tdCountry = document.createElement("td");
    tdCountry.textContent = city.country;
    tr.appendChild(tdCountry);

    // DST info
    const tdDst = document.createElement("td");
    tdDst.textContent = city.observesDst ? "Yes" : "No";
    tr.appendChild(tdDst);

    // People with +/- buttons
    const tdPeople = document.createElement("td");
    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.textContent = "−";
    decBtn.className = "people-btn";

    const spanCount = document.createElement("span");
    spanCount.textContent = city.people;
    spanCount.style.display = "inline-block";
    spanCount.style.minWidth = "2rem";
    spanCount.style.textAlign = "center";

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.textContent = "+";
    incBtn.className = "people-btn";

decBtn.addEventListener("click", () => {
  const current = Number(city.people) || 0;
  city.people = Math.max(0, current - 1);
  spanCount.textContent = city.people;
  renderSuggestions();
  updateHashFromCities();
  saveStateToStorage();
});

incBtn.addEventListener("click", () => {
  const current = Number(city.people) || 0;
  city.people = current + 1;
  spanCount.textContent = city.people;
  renderSuggestions();
  updateHashFromCities();
  saveStateToStorage();
});

    tdPeople.appendChild(decBtn);
    tdPeople.appendChild(spanCount);
    tdPeople.appendChild(incBtn);
    tr.appendChild(tdPeople);

    // Remove button
    const tdRemove = document.createElement("td");
    const btnRemove = document.createElement("button");
    btnRemove.type = "button";
    btnRemove.textContent = "Remove";
    btnRemove.addEventListener("click", () => removeCity(city.slug));
    tdRemove.appendChild(btnRemove);
    tr.appendChild(tdRemove);

    tbody.appendChild(tr);
  });

  updateCardsVisibility();
}

// 9. Suggestions + Markdown
function renderSuggestions() {
  const container = document.getElementById("suggestionsContainer");
  const mdEl = document.getElementById("markdownOutput");

  if (citiesInPoll.length < 2) {
    container.textContent = "Add at least two time zones to see suggestions.";
    mdEl.value = "";
    updateCardsVisibility();
    return;
  }

  const { slots, lengthMinutes } = generateSuggestions(citiesInPoll);
  if (!slots.length) {
    container.textContent = "No suggestions found.";
    mdEl.value = "";
    return;
  }

  const fmtUtc = date =>
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;

  let html = "";
  slots.forEach((slot, idx) => {
    const label = String.fromCharCode(65 + idx);
    html += `<h3>Option ${label} (score ${slot.score})</h3>`;
    html += `<div class="small">Start: ${fmtUtc(slot.startUtc)}; length ${lengthMinutes} minutes.</div>`;
    html += `<table><thead><tr><th>City</th><th>Local time</th><th>People</th><th>Comment</th></tr></thead><tbody>`;

    citiesInPoll.forEach(city => {
      const rng24 = formatLocalRange24(city, slot.startUtc, lengthMinutes);
      const lt = localTimeParts(slot.startUtc, city.tz);
      const hour = lt.hour;
      const cat = classifyHour(hour);

      let badgeClass = "badge-bad";
      let badgeText = "awkward hours";
      if (cat === "good") {
        badgeClass = "badge-good";
        badgeText = "within 09:00-17:00";
      } else if (cat === "ok") {
        badgeClass = "badge-ok";
        badgeText = "early/late but reasonable";
      } else if (cat === "poor") {
        badgeClass = "badge-bad";
        badgeText = "quite painful";
      } else {
        badgeClass = "badge-bad";
        badgeText = "night hours";
      }

      html += `<tr>
        <td>${city.name}</td>
        <td>${rng24}</td>
        <td>${city.people}</td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      </tr>`;
    });

    html += `</tbody></table>`;
  });

  container.innerHTML = html;
  generateMarkdown(slots, lengthMinutes);
}

function generateMarkdown(slots, lengthMinutes) {
  const mdEl = document.getElementById("markdownOutput");

  const fmtUtc = date =>
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
    `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;

  let md = "";
  md += "We are trying to schedule a call. Here are the proposed options:\n\n";

  slots.forEach((slot, idx) => {
    const label = String.fromCharCode(65 + idx);
    md += `${idx + 1}. **Option ${label}**: ${fmtUtc(slot.startUtc)} (${lengthMinutes} minutes)\n`;
    citiesInPoll.forEach(city => {
      const rng = formatLocalRange24and12(city, slot.startUtc, lengthMinutes);
      md += `   - ${city.name}: ${rng}\n`;
    });
    md += "\n";
  });

  md += "Please vote by reacting to this comment:\n";
  slots.forEach((slot, idx) => {
    const label = String.fromCharCode(65 + idx);
    const icon = idx === 0 ? "❤️" : idx === 1 ? "🚀" : "❓";
    md += `- ${icon} for Option ${label}\n`;
  });

  md += "\n";
  md += "_Generated by a static GitHub Pages tool. TODO: optional GitHub API integration._\n";

  mdEl.value = md;
}

// 10. Local storage
function saveStateToStorage() {
  if (!window.localStorage) return;
  try {
    const state = {
      cities: citiesInPoll.map(c => ({
        slug: c.slug,
        people: c.people
      })),
      params: {
        date: document.getElementById("dateInput").value || "",
        time: document.getElementById("timeInput").value || "",
        length: document.getElementById("lengthInput").value || ""
      }
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save state:", e);
  }
}

function loadStateFromStorageIfNeeded() {
  if (!window.localStorage) return;
  if (citiesInPoll.length > 0) return; // hash already decided

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);

    // Restore cities
    if (Array.isArray(state.cities) && state.cities.length) {
      const restored = [];
      state.cities.forEach(item => {
        const base = allCities.find(c => c.slug === item.slug);
        if (!base) return;
        restored.push({
          ...base,
          people: Number.isFinite(item.people) && item.people >= 0 ? item.people : 1
        });
      });
      if (restored.length) {
        citiesInPoll = restored;
        citiesInPoll.sort((a, b) => b.lon - a.lon);
        updateHashFromCities();
      }
    }

    // Restore params
    if (state.params) {
      const p = state.params;
      if (p.date)   document.getElementById("dateInput").value = p.date;
      if (p.time)   document.getElementById("timeInput").value = p.time;
      if (p.length) document.getElementById("lengthInput").value = p.length;
    }
  } catch (e) {
    console.warn("Could not load state:", e);
  }
}

// 11. Event wiring
function initEvents() {
  const addCityForm = document.getElementById("addCityForm");
  const cityInput   = document.getElementById("cityInput");

  // Keep button behaviour as fallback
  addCityForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addCityByName(cityInput.value);
    cityInput.value = "";
  });

  // Auto-add when a datalist value is picked / input loses focus with exact match
  if (cityInput) {
    cityInput.addEventListener("change", () => {
      autoAddCityIfExactMatch(cityInput.value);
      cityInput.value = "";
    });
  }

  document.getElementById("recomputeBtn").addEventListener("click", () => {
    renderSuggestions();
    saveStateToStorage();
  });

  document.getElementById("copyMarkdownBtn").addEventListener("click", () => {
    const ta = document.getElementById("markdownOutput");
    ta.select();
    document.execCommand("copy");
  });

  // Save meeting parameters on change
  ["dateInput", "timeInput", "lengthInput"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      renderSuggestions();
      saveStateToStorage();
    });
  });

  window.addEventListener("hashchange", () => {
    loadCitiesFromHash();
    renderCitiesTable();
    renderSuggestions();
    saveStateToStorage();
  });
}

// Set default time input to user's current local time rounded to the nearest hour
function defaultTimeToLocalNow() {
  const timeEl = document.getElementById("timeInput");
  if (!timeEl) return;
  if (timeEl.value) return; // respect localStorage / hash if already set

  const now = new Date();
  let hour = now.getHours();
  const mins = now.getMinutes();

  // Round to nearest hour
  if (mins >= 30) {
    hour = (hour + 1) % 24;
  }

  const hh = pad2(hour);
  timeEl.value = `${hh}:00`;
}

// 12. Init
async function init() {
  await loadCitiesJson();
  initEvents();

  initUserTimezoneInfo();
  loadCitiesFromHash();
  loadStateFromStorageIfNeeded();
  defaultTimeToLocalNow();

  renderCitiesTable();
  renderSuggestions();
}

init();