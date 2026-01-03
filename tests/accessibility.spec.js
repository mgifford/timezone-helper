import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// Configure test behavior
test.describe.configure({ mode: 'parallel' });

/**
 * Test configuration for different pages
 * Add more pages here as needed
 */
const pagesToTest = [
  { url: '/', name: 'Home Page', path: 'index.html' },
  // Add more pages as needed:
  // { url: '/about.html', name: 'About Page', path: 'about.html' },
];

/**
 * Helper function to categorize violations by severity
 */
function categorizeViolations(violations) {
  return {
    critical: violations.filter(v => v.impact === 'critical'),
    serious: violations.filter(v => v.impact === 'serious'),
    moderate: violations.filter(v => v.impact === 'moderate'),
    minor: violations.filter(v => v.impact === 'minor'),
  };
}

/**
 * Helper function to format violation details
 */
function formatViolation(violation) {
  const nodes = violation.nodes.map(node => ({
    target: node.target.join(' > '),
    html: node.html,
    failureSummary: node.failureSummary,
  }));
  
  return {
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    tags: violation.tags,
    nodes: nodes,
  };
}

// Run tests for each page
for (const page of pagesToTest) {
  test.describe(`Accessibility: ${page.name}`, () => {
    
    test('should not have critical or serious WCAG 2.2 AA violations', async ({ page: browserPage }) => {
      // Navigate with retry logic
      let retries = 3;
      while (retries > 0) {
        try {
          await browserPage.goto(`${BASE_URL}${page.url}`, { 
            waitUntil: 'networkidle',
            timeout: 10000 
          });
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Wait for page to be ready
      await browserPage.waitForLoadState('domcontentloaded');
      
      // Run axe accessibility scan
      const accessibilityScanResults = await new AxeBuilder({ page: browserPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      
      const categorized = categorizeViolations(accessibilityScanResults.violations);
      
      // Log all violations for visibility
      if (accessibilityScanResults.violations.length > 0) {
        console.log(`\n=== Accessibility Violations for ${page.name} ===\n`);
        
        if (categorized.critical.length > 0) {
          console.log('🔴 CRITICAL VIOLATIONS:');
          categorized.critical.forEach(v => console.log(JSON.stringify(formatViolation(v), null, 2)));
        }
        
        if (categorized.serious.length > 0) {
          console.log('\n🟠 SERIOUS VIOLATIONS:');
          categorized.serious.forEach(v => console.log(JSON.stringify(formatViolation(v), null, 2)));
        }
        
        if (categorized.moderate.length > 0) {
          console.log('\n🟡 MODERATE VIOLATIONS (warnings):');
          categorized.moderate.forEach(v => console.log(JSON.stringify(formatViolation(v), null, 2)));
        }
        
        if (categorized.minor.length > 0) {
          console.log('\n🔵 MINOR VIOLATIONS (info):');
          categorized.minor.forEach(v => console.log(JSON.stringify(formatViolation(v), null, 2)));
        }
      } else {
        console.log(`✅ No accessibility violations found for ${page.name}`);
      }
      
      // Fail on critical or serious violations
      const failingViolations = [...categorized.critical, ...categorized.serious];
      
      if (failingViolations.length > 0) {
        const summary = `Found ${categorized.critical.length} critical and ${categorized.serious.length} serious accessibility violations`;
        console.error(`\n❌ ${summary}\n`);
      }
      
      expect(failingViolations, 
        `${page.name} has ${categorized.critical.length} critical and ${categorized.serious.length} serious accessibility violations. See console output for details.`
      ).toHaveLength(0);
    });
    
    test('should have valid page title', async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.url}`, { waitUntil: 'domcontentloaded' });
      
      const title = await browserPage.title();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toBe('Document'); // Default title
    });
    
    test('should have proper heading structure', async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.url}`, { waitUntil: 'domcontentloaded' });
      
      // Check for h1
      const h1Count = await browserPage.locator('h1').count();
      expect(h1Count, 'Page should have exactly one h1 element').toBe(1);
      
      // Verify h1 has content
      const h1Text = await browserPage.locator('h1').first().textContent();
      expect(h1Text?.trim().length, 'h1 should have text content').toBeGreaterThan(0);
    });
    
    test('should have lang attribute on html element', async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.url}`, { waitUntil: 'domcontentloaded' });
      
      const htmlLang = await browserPage.locator('html').getAttribute('lang');
      expect(htmlLang, 'HTML element should have a lang attribute').toBeTruthy();
    });
    
    test('should not have any automatically detectable broken links', async ({ page: browserPage }) => {
      await browserPage.goto(`${BASE_URL}${page.url}`, { waitUntil: 'domcontentloaded' });
      
      // Get all links
      const links = await browserPage.locator('a[href]').all();
      const internalLinks = [];
      
      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('#')) {
          internalLinks.push(href);
        }
      }
      
      // Just log internal links for awareness
      if (internalLinks.length > 0) {
        console.log(`Internal links found on ${page.name}:`, internalLinks);
      }
    });
  });
}
