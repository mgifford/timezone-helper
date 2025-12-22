# AGENTS.md

## Project Purpose
Timezone Helper is a small, public-facing web utility that helps users compare, convert, and reason about time zones across regions.

The goal is to reduce confusion, missed meetings, and coordination errors by making time differences explicit and understandable.

This is an assistive informational tool. It must not be treated as a source of legal, contractual, or operational authority for timekeeping.

## Audience and Responsibility
This project is intended for general users coordinating across time zones, including remote teams and international collaborators.

Outputs are informational. Users remain responsible for verifying critical dates and times, especially where legal, contractual, or safety implications exist.

The tool must not present itself as an authoritative time standard (e.g., replacing official sources such as IANA or national time authorities).

## Scope
The project consists of:
- Static HTML, CSS, and JavaScript
- Client-side logic for time zone conversion and comparison
- Optional use of browser APIs (e.g., Intl, system time)

No server-side processing is assumed unless explicitly documented.

## UI Contract
The UI must be clear, predictable, and honest.

Rules:
- Display the source time zone and target time zone explicitly at all times.
- Clearly indicate the date as well as the time (to avoid off-by-one-day errors).
- Do not silently adjust or infer user intent.
- Any automatic detection (e.g., local time zone) must be visible and overrideable.

The UI must not imply certainty where ambiguity exists (e.g., during daylight saving transitions).

## Accessibility Position
Accessibility is a core requirement for this project.

The project aims to follow WCAG 2.2 AA patterns where feasible, but does not claim formal conformance.

Accessibility work focuses on:
- Keyboard access
- Clear labeling and instructions
- Perceivable changes when times or zones are updated

## Accessibility Expectations (Minimum Bar)

### Keyboard and Focus
- All controls are reachable and operable by keyboard.
- Tab order follows a logical progression through inputs and results.
- Focus indicators remain visible.
- No keyboard traps.

### Structure and Semantics
- Use semantic HTML and native form controls.
- Inputs are grouped logically (e.g., source time, source zone, target zone).
- Headings and landmarks are used appropriately.

### Labels, Instructions, and Errors
- Every input has a programmatic label.
- Instructions and helper text are associated with the relevant input.
- Invalid or ambiguous input is reported in clear text.

### Dynamic Updates
- When conversion results change, updates are perceivable.
- Important changes (e.g., date rollover) must be clearly indicated and not rely on color alone.

### Touch and Pointer Use
- Controls are sized and spaced to avoid accidental activation.
- No interaction relies solely on hover or fine pointer movement.

## Error Handling and Edge Cases
- Clearly handle and explain daylight saving transitions.
- Surface ambiguous or invalid times explicitly.
- Do not fail silently on unsupported or unexpected inputs.
- If browser APIs are unavailable, provide a clear fallback message.

## Data Handling and Privacy
- Do not collect or transmit personal data.
- Any use of localStorage or similar must be documented and optional.
- Do not include analytics or tracking by default.

## Dependencies
- Prefer built-in browser APIs (e.g., Intl) over external libraries.
- Avoid external scripts with unclear provenance.
- Document any third-party libraries used, including purpose and limitations.
- Do not commit secrets or API keys.

## Testing Expectations
Manual testing is required for changes affecting behavior or UI:
- Keyboard-only walkthrough
- Verification of focus visibility
- Testing around daylight saving changes
- Testing with different locales and time zones
- Zoom testing up to 200%

Automated tests are encouraged but do not replace manual verification.

## Contribution Standards
Pull requests should include:
- A description of the change and its intent
- Notes on any UI or accessibility impact
- Documentation of known limitations or edge cases introduced

## Definition of Done
A change is complete only when:
- Time conversions are correct and clearly explained
- UI updates are perceivable and understandable
- Keyboard and accessibility behavior has not regressed
- Edge cases are handled or explicitly documented
- No hidden assumptions are introduced

This project values clarity, correctness, and accessibility over cleverness.
