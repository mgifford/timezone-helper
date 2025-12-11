# Global Meeting Time Helper

This project is a static, client-side tool for finding reasonable meeting times across multiple time zones. It runs entirely in the browser and can be hosted on GitHub Pages. The goal is to make global scheduling easier by visualizing local times, scoring candidate meeting slots, and generating Markdown suitable for GitHub issues.

The tool accepts a list of cities, organizes them east-to-west, computes local times for each participant group, and proposes meeting times that minimize overall inconvenience. It also supports weighted groups, browser-based time defaults, and URL-encoded state.

## Features

### 1. City and time-zone selection
- Autocomplete search for cities with known time zones.
- Data sourced from GeoNames and merged with IANA time zone identifiers.
- Cities are sorted east-to-west based on longitude.
- Adding a city immediately updates the interface and the URL.

### 2. Participant weighting
- Each city has an associated number of participants (“people”).
- The scoring algorithm considers working hours, early hours, late hours, and night hours.
- The default assumption is one participant; values greater than one act as weight multipliers.

### 3. URL encoding
The tool encodes the full state in the URL hash.

Examples:

```
#/utc/tokyo_jp/paris_fr/ottawa_ca
#/utc/tokyo_jp:7/paris_fr/calgary_ca:2/ottawa_ca
```

Rules:
- `slug` identifies a city.
- `slug:7` indicates a participant count greater than one.
- If the number is omitted, it is treated as one.
- Hash format is backward-compatible with earlier versions.

### 4. Local defaults
- The browser timezone is detected and used to set:
  - The default time field (rounded to the nearest hour).
  - The timezone label shown to the user.
- The interface displays the user’s local UTC offset.

### 5. Meeting suggestions
- The tool explores candidate start times between 06:00 and 21:00 UTC.
- Each option receives a score based on how painful the meeting time is for participants.
- The two lowest-scoring options are presented.

### 6. Markdown for GitHub issues
The tool generates Markdown that includes:
- 24-hour time ranges.
- Corresponding 12-hour ranges.
- User-friendly annotations for voting (👍, 👀, etc.).

Example:

```
1. Option A: 2025-01-03 13:00 UTC (60 minutes)
   - Tokyo: 22:00-23:00 (10:00-11:00pm)
   - Ottawa: 08:00-09:00 (8:00-9:00am)
```

## Installation

### Requirements
- Any static file host.
- No build pipeline, no backend, no API keys.

### Running locally

```
python3 -m http.server 8000
```

Visit:

```
http://localhost:8000/
```

## Data sources

### `data/timezones-with-latlon.json`
Contains:
- City name  
- Country code  
- IANA timezone  
- Latitude / longitude  
- DST flag  

Built from:
- The user's original timezone list  
- GeoNames city data (population ≥ 1,000,000 plus representative cities per timezone)  
- Derived longitude estimates when no geolocation is available  

### Slug format
```
<city_name_normalized>_<country_code_lowercase>
```

## Scoring

Hour categories:
- **good**: 09:00–17:00 (0 penalty)
- **ok**: 07:00–09:00, 17:00–21:00 (1 penalty)
- **poor**: 05:00–07:00, 21:00–23:00 (3 penalty)
- **terrible**: all other times (6 penalty)

Score = sum(city_penalty × participants). Lower is better.

## State storage

- **URL hash** for sharing.
- **LocalStorage** for restoring state on revisit.

## Compatibility

- Modern Chrome, Firefox, Safari, Edge.
- Requires `Intl.DateTimeFormat` with `timeZone`, `fetch`, ES6.

## Limitations

- Only hourly UTC windows are evaluated.
- Daylight visualization is not yet implemented.
- City dataset may contain duplicates or approximations.
- GitHub API integration is planned but not implemented.

## Roadmap

- Add day/night globe visualization.
- Export calendar files.
- Improve participant weighting controls.
- Integrate GitHub API for automated issue creation.
- Better grouping of cities within the same timezone.

## Contributing

Contributions are welcome. Areas of improvement include:
- Data cleanup
- UI refinement
- Accessibility improvements
- Better time-zone heuristics

## License

Specify a license (MIT, Apache-2.0, etc.).
