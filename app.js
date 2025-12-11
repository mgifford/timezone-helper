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

function findCityForTimeZone(tz) {
  if (!tz) return null;

  // Exact match first
  let matches = allCities.filter(c => c.tz === tz);
  if (matches.length) {
    return matches[0];
  }

  // Fallback: case-insensitive match
  const lower = tz.toLowerCase();
  matches = allCities.filter(c => c.tz.toLowerCase() === lower);
  if (matches.length) {
    return matches[0];
  }

  return null;
}

/**
 * Ensure there is at least one city in citiesInPoll with the user's timezone.
 * Returns the city that was added (clone) or null if nothing was added.
 */
function ensureOrganizerCityPresent() {
  // Already present?
  const has = citiesInPoll.some(c => c.tz === USER_TZ);
  if (has) return null;

  const base = findCityForTimeZone(USER_TZ);
  if (!base) return null;

  const clone = { ...base, people: 1 };
  citiesInPoll.push(clone);
  citiesInPoll.sort((a, b) => b.lon - a.lon);
  updateHashFromCities();
  return clone;
}

function showError(msg) {
  const el = document.getElementById("loadError");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

function clearError() {
  const el = document.getElementById("loadError");
  if (!el) return;
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

// Timezone label helper
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
    // Example values: "GMT-5", "UTC+1"
    return tzPart.value.replace("GMT", "UTC");
  } catch (e) {
    return "UTC";
  }
}

function initUserTimezoneInfo() {
  const offsetLabel = getUserTimezoneOffsetLabel();

  // Optional visible info
  const infoEl = document.getElementById("userTimezoneInfo");
  if (infoEl) {
    infoEl.textContent = `Your timezone: ${USER_TZ} (${offsetLabel})`;
  }

  // Update label for time input to reflect real timezone
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
  if (!dl) return;
  dl.innerHTML = "";
  allCities.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    dl.appendChild(opt);
  });
}

// 3. URL hash handling (with weights)

function updateHashFromCities() {
  if (!citiesInPoll.length) {
    window.location.hash = "";
    return;
  }

  const segments = citiesInPoll.map(c => {
    const people = Number(c.people) || 0;
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

function addCityByName(nameRaw) {
  const name = (nameRaw || "").trim();
  const errEl = document.getElementById("addCityError");

  if (!name) {
    if (errEl) {
      errEl.textContent = "Please type a city name.";
      errEl.style.display = "block";
    }
    return;
  }

  const city = allCitiesByNameLower[name.toLowerCase()];
  if (!city) {
    if (errEl) {
      errEl.textContent = `No city named "${name}" found in data.`;
      errEl.style.display = "block";
    }
    return;
  }

  const already = citiesInPoll.find(c => c.slug === city.slug);
  if (already) {
    if (errEl) {
      errEl.textContent = `"${city.name}" is already in the list.`;
      errEl.style.display = "block";
    }
    return;
  }

  if (errEl) {
    errEl.textContent = "";
    errEl.style.display = "none";
  }

  const clone = { ...city, people: 1 };
  citiesInPoll.push(clone);
  citiesInPoll.sort((a, b) => b.lon - a.lon);

  updateHashFromCities();
  renderCitiesTable();
  renderSuggestions();
  saveStateToStorage();
}

// Auto-add when the user chooses an exact city name from the datalist
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
  const dateEl = document.getElementById("dateInput");
  const timeEl = document.getElementById("timeInput");
  const dateStr = dateEl ? dateEl.value : "";
  const timeStr = timeEl ? timeEl.value : "";

  let dateInfo = null;
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    dateInfo = { year: y, month: m, day: d };
  }

  let timeInfo = null;
  if (isTimeEnabled() && timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    timeInfo = { hour: hh || 0, minute: mm || 0 };
  }

  return { dateInfo, timeInfo };
}

function buildUtcDate(dateInfo, hour, minute) {
  if (dateInfo) {
    // Interpret the date as a UTC calendar date
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

function isTimeEnabled() {
  const cb = document.getElementById("timeEnabled");
  return !!(cb && cb.checked);
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
    second: "2-digit",
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
    minute: parseInt(obj.minute, 10),
    second: parseInt(obj.second, 10)
  };
}

// Format for tables: 24-hour range with “different day” marker
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

// 12-hour helper and combined 24+12 for Markdown
function to12hParts(hour, minute) {
  let suffix = hour < 12 ? "am" : "pm";
  let h = hour % 12;
  if (h === 0) h = 12;
  return { h, minute: pad2(minute), suffix };
}

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
    range12 = `${start12.h}:${start12.minute}-${end12.h}:${end12.minute}${start12.suffix}`;
  } else {
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

// 7. Timezone conversion: user local to UTC

function getTimeZoneOffsetForDate(dateUtc, timeZone) {
  // Returns offsetMinutes such that: local = UTC + offsetMinutes
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = fmt.formatToParts(dateUtc);
  const obj = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      obj[p.type] = p.value;
    }
  }

  const localMillis = Date.UTC(
    parseInt(obj.year, 10),
    parseInt(obj.month, 10) - 1,
    parseInt(obj.day, 10),
    parseInt(obj.hour, 10),
    parseInt(obj.minute, 10),
    parseInt(obj.second, 10)
  );

  const utcMillis = dateUtc.getTime();
  const offsetMinutes = (localMillis - utcMillis) / (60 * 1000);
  return offsetMinutes; // local = UTC + offsetMinutes
}

function userLocalTimeToUtc(dateInfo, timeInfo) {
  // Converts the user’s local wall time in USER_TZ to a UTC Date.
  // Returns null if no time is specified.
  if (!timeInfo) return null;

  const now = new Date();
  const year = dateInfo ? dateInfo.year : now.getFullYear();
  const monthIndex = dateInfo ? (dateInfo.month - 1) : now.getMonth();
  const day = dateInfo ? dateInfo.day : now.getDate();

  // Approximate this moment as if it were UTC, then compute the actual offset
  const approxUtc = new Date(Date.UTC(
    year,
    monthIndex,
    day,
    timeInfo.hour,
    timeInfo.minute,
    0
  ));

  const offsetMinutes = getTimeZoneOffsetForDate(approxUtc, USER_TZ);

  // If local = UTC + offset, then UTC = local - offset
  return new Date(approxUtc.getTime() - offsetMinutes * 60 * 1000);
}


// 8. DST helpers (Europe & North America only)

function getDstRegionForTz(tz) {
  if (!tz) return null;
  if (tz.startsWith("Europe/")) return "eu";
  if (tz.startsWith("America/")) return "na";
  return null;
}

function getDstPattern(region) {
  if (region === "eu") {
    return "Last Sunday in March & October";
  }
  if (region === "na") {
    return "Second Sunday in March & First Sunday in November";
  }
  return "";
}

// weekday: 0=Sunday..6=Saturday, nth>=1
function getNthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = first.getUTCDay();
  const diff = (weekday - firstWeekday + 7) % 7;
  const day = 1 + diff + (nth - 1) * 7;
  return new Date(Date.UTC(year, monthIndex, day, 2, 0)); // 02:00 UTC-ish
}

function getLastWeekdayOfMonth(year, monthIndex, weekday) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)); // last day of month
  const lastWeekday = last.getUTCDay();
  const diff = (lastWeekday - weekday + 7) % 7;
  const day = last.getUTCDate() - diff;
  return new Date(Date.UTC(year, monthIndex, day, 1, 0)); // 01:00 UTC-ish
}

function getNaDstDates(year) {
  // North America: second Sunday in March, first Sunday in November
  const startUtc = getNthWeekdayOfMonth(year, 2, 0, 2);  // March, Sunday, 2nd
  const endUtc   = getNthWeekdayOfMonth(year, 10, 0, 1); // November, Sunday, 1st
  return { startUtc, endUtc };
}

function getEuDstDates(year) {
  // Europe: last Sunday in March and October
  const startUtc = getLastWeekdayOfMonth(year, 2, 0); // March
  const endUtc   = getLastWeekdayOfMonth(year, 9, 0); // October
  return { startUtc, endUtc };
}

/**
 * For a DST-observing European / North American time zone and a reference date,
 * returns an object:
 * {
 *   observes: true,
 *   region: "eu" | "na",
 *   pattern: "Last Sunday in March & October" | "Second Sunday in March & First Sunday in November",
 *   startUtc, endUtc,
 *   upcoming: boolean,     // within 30 days before next change
 *   firstWeekAfter: boolean // within 7 days after change
 * }
 * or null if DST doesn't apply.
 */
function getDstStatus(city, referenceDateUtc) {
  if (!city.observesDst) return null;

  const region = getDstRegionForTz(city.tz);
  if (!region) return null;

  const year = referenceDateUtc.getUTCFullYear();
  let dates;
  if (region === "na") {
    dates = getNaDstDates(year);
  } else if (region === "eu") {
    dates = getEuDstDates(year);
  } else {
    return null;
  }

  const { startUtc, endUtc } = dates;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilStart = (startUtc - referenceDateUtc) / msPerDay;
  const daysUntilEnd   = (endUtc   - referenceDateUtc) / msPerDay;

  const upcoming =
    (daysUntilStart >= 0 && daysUntilStart <= 30) ||
    (daysUntilEnd   >= 0 && daysUntilEnd   <= 30);

  const inFirstWeekAfterStart =
    referenceDateUtc >= startUtc &&
    referenceDateUtc < new Date(startUtc.getTime() + 7 * msPerDay);

  const inFirstWeekAfterEnd =
    referenceDateUtc >= endUtc &&
    referenceDateUtc < new Date(endUtc.getTime() + 7 * msPerDay);

  const firstWeekAfter = inFirstWeekAfterStart || inFirstWeekAfterEnd;

  return {
    observes: true,
    region,
    pattern: getDstPattern(region),
    startUtc,
    endUtc,
    upcoming,
    firstWeekAfter
  };
}


// 8. Suggestions: 2 best + 1 organizer-chosen

function generateSuggestions(cities) {
  const lengthEl = document.getElementById("lengthInput");
  const lengthMinutes = parseInt(lengthEl ? lengthEl.value : "60", 10) || 60;
  const { dateInfo, timeInfo } = parseDateTimeSettings();
  const userSlotUtc = timeInfo ? userLocalTimeToUtc(dateInfo, timeInfo) : null;

  const searchSlots = [];

  // If time is specified, only its minute part affects search band
  const baseMinute = timeInfo ? timeInfo.minute : 0;

  // Search between 06:00 and 21:00 UTC for auto suggestions
  for (let hour = 6; hour <= 21; hour++) {
    const startUtc = buildUtcDate(dateInfo, hour, baseMinute);
    const score = scoreSlot(cities, startUtc, lengthMinutes);
    searchSlots.push({ startUtc, score, isUserProposed: false });
  }

  searchSlots.sort((a, b) => a.score - b.score);

  // Two best automatic options
  const auto = searchSlots.slice(0, 2);

  // Organizer’s chosen time in USER_TZ, if time is specified and enabled
  if (userSlotUtc) {
    const userScore = scoreSlot(cities, userSlotUtc, lengthMinutes);
    const existing = auto.find(
      s => Math.abs(s.startUtc.getTime() - userSlotUtc.getTime()) < 60 * 1000
    );

    if (existing) {
      existing.isUserProposed = true;
    } else {
      auto.push({
        startUtc: userSlotUtc,
        score: userScore,
        isUserProposed: true
      });
    }
  }

  return { slots: auto, lengthMinutes };
}

// 9. Card visibility

function updateCardsVisibility() {
  const hasCities       = citiesInPoll.length >= 1;
  const hasEnoughCities = citiesInPoll.length >= 2;

  const cardTimezones   = document.getElementById("cardTimezones");
  const cardSuggestions = document.getElementById("cardSuggestions");
  const cardMarkdown    = document.getElementById("cardMarkdown");
  const cardMap         = document.getElementById("cardMap");

  if (cardTimezones) {
    cardTimezones.style.display = hasCities ? "block" : "none";
  }
  if (cardSuggestions) {
    cardSuggestions.style.display = hasEnoughCities ? "block" : "none";
  }
  if (cardMarkdown) {
    cardMarkdown.style.display = hasEnoughCities ? "block" : "none";
  }
  if (cardMap) {
    cardMap.style.display = hasEnoughCities ? "block" : "none";
  }
}

// 10. Rendering cities table

function renderCitiesTable() {
  const tbody = document.querySelector("#citiesTable tbody");
  if (!tbody) return;
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
    renderMap();
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
  renderMap();
}

// 11. Suggestions + Markdown

function renderSuggestions() {
  const container = document.getElementById("suggestionsContainer");
  const mdEl = document.getElementById("markdownOutput");
  if (!container || !mdEl) return;

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

  // Determine reference date for DST logic:
  // - If a date is chosen, use that date.
  // - Otherwise use "today".
  const { dateInfo } = parseDateTimeSettings();
  const hasDate = !!dateInfo;
  let referenceDateUtc;
  if (hasDate) {
    referenceDateUtc = new Date(Date.UTC(dateInfo.year, dateInfo.month - 1, dateInfo.day));
  } else {
    referenceDateUtc = new Date();
  }

  // Precompute DST status for each city
  const dstMap = {};
  citiesInPoll.forEach(city => {
    const dst = getDstStatus(city, referenceDateUtc);
    if (dst) {
      dstMap[city.slug] = dst;
    }
  });

  // If no date is chosen, only show time; if date is chosen, show date+time.
  const fmtUtc = date => {
    const timeStr = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
    if (!hasDate) {
      return timeStr;
    }
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${timeStr}`;
  };

  let html = "";
  slots.forEach((slot, idx) => {
    const optLabel = String.fromCharCode(65 + idx);
    const extra = slot.isUserProposed ? " (organizer's chosen time)" : "";
    html += `<h3>Option ${optLabel}${extra} (score ${slot.score})</h3>`;

    if (hasDate) {
      html += `<div class="small">Start: ${fmtUtc(slot.startUtc)}; length ${lengthMinutes} minutes.</div>`;
    } else {
      // You explicitly did not want a synthetic date here.
      html += `<div class="small">Length: ${lengthMinutes} minutes.</div>`;
    }

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

      const dst = dstMap[city.slug];
      let extraNote = "";
      if (dst && dst.observes) {
        if (dst.firstWeekAfter) {
          extraNote = " <strong>This is in the first week after a daylight savings change.</strong>";
        } else if (dst.upcoming) {
          extraNote = " Upcoming daylight savings change within about a month.";
        }
      }

      html += `<tr>
        <td>${city.name}</td>
        <td>${rng24}</td>
        <td>${city.people}</td>
        <td><span class="badge ${badgeClass}">${badgeText}</span>${extraNote}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
  });

  container.innerHTML = html;
  generateMarkdown(slots, lengthMinutes, referenceDateUtc);
  renderMap();
}

function generateMarkdown(slots, lengthMinutes, referenceDateUtc) {
  const mdEl = document.getElementById("markdownOutput");
  if (!mdEl) return;

  // Determine whether a date was chosen.
  const { dateInfo } = parseDateTimeSettings();
  const hasDate = !!dateInfo;

  // If referenceDateUtc was not passed (defensive), recompute
  if (!referenceDateUtc) {
    if (hasDate) {
      referenceDateUtc = new Date(Date.UTC(dateInfo.year, dateInfo.month - 1, dateInfo.day));
    } else {
      referenceDateUtc = new Date();
    }
  }

  // Helper: date+time when date is chosen, otherwise just time
  const fmtUtc = date => {
    const timeStr = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
    if (!hasDate) {
      return timeStr;
    }
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${timeStr}`;
  };

  let md = "";
  md += "We are trying to schedule a call. Here are the proposed options:\n\n";

  slots.forEach((slot, idx) => {
    const optLabel = String.fromCharCode(65 + idx);
    const extra = slot.isUserProposed ? " (organizer's chosen time)" : "";
    md += `${idx + 1}. **Option ${optLabel}${extra}**: ${fmtUtc(slot.startUtc)} (${lengthMinutes} minutes)\n`;

    citiesInPoll.forEach(city => {
      const rng = formatLocalRange24and12(city, slot.startUtc, lengthMinutes);
      const dst = getDstStatus(city, referenceDateUtc);

      let line = `   - ${city.name}: ${rng}`;

      // Always include DST info for DST-observing EU/NA cities
      if (dst && dst.observes) {
        if (dst.pattern) {
          line += ` - Daylight Savings (${dst.pattern})`;
        } else {
          line += " - Daylight Savings";
        }

        if (dst.firstWeekAfter) {
          line += " **This is in the first week after a daylight savings change.**";
        } else if (dst.upcoming) {
          line += " _(Upcoming daylight savings change within about a month.)_";
        }
      }

      md += line + "\n";
    });

    md += "\n";
  });
  md += "Please vote by reacting to this comment:\n";
  slots.forEach((slot, idx) => {
    const optLabel = String.fromCharCode(65 + idx);
    const icon = idx === 0 ? "❤️" : idx === 1 ? "🚀" : "👀";
    md += `- ${icon} for Option ${optLabel}\n`;
  });

  md += "\n";
  md += "_Generated by a static GitHub Pages tool. TODO: optional GitHub API integration._\n";

  mdEl.value = md;
}

// 12. Local storage

function saveStateToStorage() {
  if (!window.localStorage) return;
  try {
    const state = {
      cities: citiesInPoll.map(c => ({
        slug: c.slug,
        people: c.people
      })),
params: {
  date: (document.getElementById("dateInput") || {}).value || "",
  timeEnabled: !!(document.getElementById("timeEnabled") && document.getElementById("timeEnabled").checked),
  time: (document.getElementById("timeInput") || {}).value || "",
  length: (document.getElementById("lengthInput") || {}).value || ""
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
      const dateEl = document.getElementById("dateInput");
      const timeEl = document.getElementById("timeInput");
      const lenEl  = document.getElementById("lengthInput");
      const timeCb = document.getElementById("timeEnabled");
      const timeRow = document.getElementById("timeInputRow");

      if (p.date && dateEl)   dateEl.value = p.date;
      if (typeof p.timeEnabled === "boolean" && timeCb && timeRow) {
        timeCb.checked = p.timeEnabled;
        timeRow.style.display = p.timeEnabled ? "block" : "none";
      }
      if (p.time && timeEl)   timeEl.value = p.time;
      if (p.length && lenEl)  lenEl.value = p.length;
    }


  } catch (e) {
    console.warn("Could not load state:", e);
  }
}

// 13. Events

function initEvents() {
  const addCityForm = document.getElementById("addCityForm");
  const cityInput   = document.getElementById("cityInput");

  if (addCityForm && cityInput) {
    addCityForm.addEventListener("submit", (e) => {
      e.preventDefault();
      addCityByName(cityInput.value);
      cityInput.value = "";
    });

    cityInput.addEventListener("change", () => {
      autoAddCityIfExactMatch(cityInput.value);
      cityInput.value = "";
    });
  }

  const recomputeBtn = document.getElementById("recomputeBtn");
  if (recomputeBtn) {
    recomputeBtn.addEventListener("click", () => {
      renderSuggestions();
      saveStateToStorage();
    });
  }


  const timeEnabled = document.getElementById("timeEnabled");
  const timeInputRow = document.getElementById("timeInputRow");

  if (timeEnabled && timeInputRow) {
    timeEnabled.addEventListener("change", () => {
      const enabled = timeEnabled.checked;
      timeInputRow.style.display = enabled ? "block" : "none";

      if (enabled) {
        // Make sure organizer's timezone is represented
        const added = ensureOrganizerCityPresent();
        if (added) {
          renderCitiesTable();
        }

        // Set default time when the user turns it on
        defaultTimeToLocalNow();
      } else {
        const timeEl = document.getElementById("timeInput");
        if (timeEl) timeEl.value = "";
      }

      renderSuggestions();
      saveStateToStorage();
    });
  }


  const copyMarkdownBtn = document.getElementById("copyMarkdownBtn");
  if (copyMarkdownBtn) {
    copyMarkdownBtn.addEventListener("click", () => {
      const ta = document.getElementById("markdownOutput");
      if (!ta) return;
      ta.select();
      document.execCommand("copy");
    });
  }

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

  const cb = document.getElementById("timeEnabled");
  if (cb && !cb.checked) return; // do nothing if the user hasn't enabled time

  if (timeEl.value) return; // respect stored value

  const now = new Date();
  let hour = now.getHours();
  const mins = now.getMinutes();

  if (mins >= 30) {
    hour = (hour + 1) % 24;
  }

  const hh = pad2(hour);
  timeEl.value = `${hh}:00`;
}

// 14. Map

// 15. Participants map (flat equirectangular projection)

function renderMap() {
  const svg = document.getElementById("participantsMap");
  const cardMap = document.getElementById("cardMap");
  if (!svg) return;

  // Clear existing content
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Only render if we actually have more than one city
  if (citiesInPoll.length < 2) {
    if (cardMap) cardMap.style.display = "none";
    return;
  }

  // Ensure the map card is visible; updateCardsVisibility will also enforce this.
  if (cardMap && cardMap.style.display === "none") {
    cardMap.style.display = "block";
  }

  const width = 800;
  const height = 300;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  // Background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(height));
  bg.setAttribute("fill", "#0b1020");
  svg.appendChild(bg);

  // Simple gridlines every 60° longitude, 30° latitude for orientation
  const gridLongitudes = [-120, -60, 0, 60, 120];
  const gridLatitudes = [-60, -30, 0, 30, 60];

  gridLongitudes.forEach(lon => {
    const x = ((lon + 180) / 360) * width;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", 0);
    line.setAttribute("x2", x);
    line.setAttribute("y2", height);
    line.setAttribute("class", "map-grid-line");
    svg.appendChild(line);
  });

  gridLatitudes.forEach(lat => {
    const y = ((90 - lat) / 180) * height;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", 0);
    line.setAttribute("y1", y);
    line.setAttribute("x2", width);
    line.setAttribute("y2", y);
    line.setAttribute("class", "map-grid-line");
    svg.appendChild(line);
  });

  // Plot each city as a circle, radius weighted by `people`
  citiesInPoll.forEach(city => {
    if (!Number.isFinite(city.lat) || !Number.isFinite(city.lon)) {
      return;
    }

    // Clamp lon/lat into sensible ranges just in case
    const lon = Math.max(-180, Math.min(180, city.lon));
    const lat = Math.max(-90, Math.min(90, city.lat));

    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;

    const people = Math.max(1, Number(city.people) || 1);
    // Basic weighting: sqrt so big groups don't explode
    const radius = 3 + Math.sqrt(people);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", radius.toFixed(1));
    circle.setAttribute(
      "class",
      people > 3 ? "map-city" : "map-city map-city-small"
    );

    // Accessible title: city name, timezone, people
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${city.name} (${city.tz}) – ${people} participant${people === 1 ? "" : "s"}`;
    circle.appendChild(title);

    svg.appendChild(circle);
  });
}

// 15. Init

async function init() {
  await loadCitiesJson();
  initEvents();

  initUserTimezoneInfo();
  loadCitiesFromHash();
  loadStateFromStorageIfNeeded();

  const cityInput = document.getElementById("cityInput");

  if (citiesInPoll.length === 0) {
    // No hash/state: assume this is a fresh visit. Add organizer's city.
    const added = ensureOrganizerCityPresent();
    if (added) {
      if (cityInput) {
        // Pre-fill the input with this city name to make it obvious
        cityInput.value = added.name;
      }
    } else {
      // If we cannot find a city for this timezone, at least suggest it as placeholder
      const rep = findCityForTimeZone(USER_TZ);
      if (rep && cityInput) {
        cityInput.placeholder = rep.name;
      }
    }
  } else {
    // There are already cities (via hash or saved state).
    // Just use the local timezone city as a placeholder suggestion, if we can.
    const rep = findCityForTimeZone(USER_TZ);
    if (rep && cityInput && !cityInput.placeholder) {
      cityInput.placeholder = rep.name;
    }
  }

  defaultTimeToLocalNow();
  renderCitiesTable();
  renderSuggestions();
  renderMap();
}

init();