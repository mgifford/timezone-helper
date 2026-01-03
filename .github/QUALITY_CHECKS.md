# Quality Checks Workflow

This repository includes automated quality checks for the static HTML site using GitHub Actions.

## Overview

The workflow runs three types of checks:

1. **HTML Validation** - Validates HTML syntax and best practices
2. **Accessibility Testing** - WCAG 2.2 AA compliance checks
3. **Security Checks** - Scans for security issues and tracking scripts

## Workflow Triggers

The quality checks run automatically on:
- Push to `main` branch
- Pull requests to `main` branch

## Checks Performed

### 1. HTML Validation

Uses `html-validate` to check:
- Valid HTML5 syntax
- Proper element nesting
- Required attributes
- Duplicate IDs
- WCAG-related HTML issues

**Configuration:** [.htmlvalidate.json](.htmlvalidate.json)

**Failure conditions:** 
- Any HTML syntax errors
- Missing required attributes
- Invalid element usage

### 2. Accessibility Testing

Uses Playwright with axe-core to test:
- WCAG 2.0 Level A & AA
- WCAG 2.1 Level A & AA
- WCAG 2.2 Level AA

**Test file:** [tests/accessibility.spec.js](tests/accessibility.spec.js)

**Failure conditions:**
- Critical accessibility violations
- Serious accessibility violations

**Warning conditions (non-blocking):**
- Moderate violations
- Minor violations

**Pages tested:**
- Home page (index.html)
- Add more pages in `tests/accessibility.spec.js` as needed

### 3. Security Checks

Uses a custom Python script to check:
- No hardcoded API keys, tokens, or secrets
- No third-party tracking scripts (Google Analytics, Facebook Pixel, etc.)
- No unsafe JavaScript patterns (`eval()`, etc.)
- External links have proper security attributes
- No mixed content (HTTP resources on HTTPS pages)
- Missing Subresource Integrity (SRI) on external scripts

**Script:** [.github/scripts/security-check.py](.github/scripts/security-check.py)

**Failure conditions:**
- Hardcoded secrets detected
- Third-party tracking scripts found

**Warning conditions (non-blocking):**
- HTTP resources (should use HTTPS)
- Missing SRI attributes
- Unsafe JavaScript patterns

## Running Checks Locally

### Prerequisites

Install dependencies:
```bash
npm install
```

### Run All Checks

```bash
npm run quality:all
```

### Run Individual Checks

**HTML Validation:**
```bash
npm run validate:html
```

**Accessibility Tests:**
```bash
# Start a local server first
python3 -m http.server 8080 &

# Run tests
npm run test:accessibility

# Stop the server
killall python3
```

**Security Checks:**
```bash
npm run security:check
```

## Viewing Test Reports

When accessibility tests run in CI, they generate an HTML report that's uploaded as an artifact.

To view the report:
1. Go to the Actions tab in GitHub
2. Click on the workflow run
3. Download the `accessibility-report` artifact
4. Extract and open `index.html` in a browser

## Configuration

### Adding More Pages to Test

Edit `tests/accessibility.spec.js` and add entries to the `pagesToTest` array:

```javascript
const pagesToTest = [
  { url: '/', name: 'Home Page', path: 'index.html' },
  { url: '/about.html', name: 'About Page', path: 'about.html' },
  // Add more pages here
];
```

### Adjusting HTML Validation Rules

Edit `.htmlvalidate.json` to customize rules. See [html-validate documentation](https://html-validate.org/rules/index.html).

### Modifying Security Checks

Edit `.github/scripts/security-check.py` to:
- Add/remove tracking domains from `TRACKING_DOMAINS`
- Add allowed CDN domains to `ALLOWED_DOMAINS`
- Adjust patterns for secret detection

### Changing Severity Levels

In `.github/workflows/quality-checks.yml`, you can adjust what causes failures:

- Change `continue-on-error: false` to `continue-on-error: true` to make a check non-blocking
- Adjust the accessibility test to fail on different severity levels by editing `tests/accessibility.spec.js`

## Understanding Results

### Accessibility Violation Levels

- **Critical** 🔴: Serious barriers, build fails
- **Serious** 🟠: Major issues, build fails  
- **Moderate** 🟡: Notable issues, warning only
- **Minor** 🔵: Best practice suggestions, info only

### Common Violations and Fixes

**Missing alt text on images:**
```html
<!-- Bad -->
<img src="photo.jpg">

<!-- Good -->
<img src="photo.jpg" alt="Description of the image">
```

**Missing form labels:**
```html
<!-- Bad -->
<input type="text" name="email">

<!-- Good -->
<label for="email">Email:</label>
<input type="text" id="email" name="email">
```

**Poor color contrast:**
Use tools like [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) to ensure text has sufficient contrast.

## Troubleshooting

### Playwright Installation Issues

If Playwright fails to install browsers:
```bash
npx playwright install --with-deps chromium
```

### Server Connection Issues

If accessibility tests can't connect to the server:
- Ensure port 8080 is not in use
- Check firewall settings
- Wait longer for server startup (adjust `sleep` time in workflow)

### False Positives

If you get false positive violations:
1. Review the detailed violation output
2. If valid, fix the code
3. If invalid, you may need to adjust axe-core rules or use `axe.configure()`

## Resources

- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [html-validate Documentation](https://html-validate.org/)
- [Playwright Testing](https://playwright.dev/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [WebAIM Accessibility Resources](https://webaim.org/resources/)

## Support

For issues with the quality checks workflow:
1. Check the Actions tab for detailed error logs
2. Review the test reports and artifacts
3. Run checks locally to reproduce issues
4. Consult the documentation links above
