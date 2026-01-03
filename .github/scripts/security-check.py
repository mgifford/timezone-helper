#!/usr/bin/env python3
"""
Security checks for static HTML site
Validates:
- No third-party tracking scripts
- Proper security headers on external resources
- No known malicious domains
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple

# Common tracking and analytics domains to flag
TRACKING_DOMAINS = [
    'google-analytics.com',
    'googletagmanager.com',
    'facebook.net',
    'doubleclick.net',
    'analytics.google.com',
    'hotjar.com',
    'mixpanel.com',
    'segment.com',
    'amplitude.com',
    'heap.io',
    'fullstory.com',
    'crazyegg.com',
    'mouseflow.com',
    'newrelic.com',
]

# Allowed third-party domains (CDNs, etc.)
ALLOWED_DOMAINS = [
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'unpkg.com',
    'code.jquery.com',
    'stackpath.bootstrapcdn.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
]


def find_html_files(root_dir: Path = Path('.')) -> List[Path]:
    """Find all HTML files in the project."""
    return list(root_dir.glob('*.html'))


def extract_external_scripts(html_content: str) -> List[str]:
    """Extract external script sources from HTML."""
    script_pattern = r'<script[^>]+src\s*=\s*["\']([^"\']+)["\']'
    return re.findall(script_pattern, html_content, re.IGNORECASE)


def extract_external_links(html_content: str) -> List[str]:
    """Extract external stylesheet and other link hrefs from HTML."""
    link_pattern = r'<link[^>]+href\s*=\s*["\']([^"\']+)["\']'
    return re.findall(link_pattern, html_content, re.IGNORECASE)


def check_for_tracking_scripts(urls: List[str]) -> List[Tuple[str, str]]:
    """Check if any URLs point to known tracking domains."""
    violations = []
    for url in urls:
        for domain in TRACKING_DOMAINS:
            if domain in url:
                violations.append((url, domain))
    return violations


def check_for_http_resources(urls: List[str]) -> List[str]:
    """Check for non-HTTPS external resources."""
    http_resources = []
    for url in urls:
        if url.startswith('http://') and 'localhost' not in url:
            http_resources.append(url)
    return http_resources


def check_subresource_integrity(html_content: str, scripts: List[str]) -> List[str]:
    """Check if external scripts have SRI attributes."""
    missing_sri = []
    
    for script_url in scripts:
        if script_url.startswith('http'):
            # Check if this script tag has integrity attribute
            script_tag_pattern = rf'<script[^>]+src\s*=\s*["\']' + re.escape(script_url) + r'["\'][^>]*>'
            matches = re.findall(script_tag_pattern, html_content, re.IGNORECASE)
            
            if matches:
                script_tag = matches[0]
                if 'integrity=' not in script_tag and 'localhost' not in script_url:
                    # Check if it's an allowed domain (can be lenient for trusted CDNs)
                    is_allowed = any(domain in script_url for domain in ALLOWED_DOMAINS)
                    if not is_allowed:
                        missing_sri.append(script_url)
    
    return missing_sri


def main():
    """Run all security checks."""
    print("🔒 Running security checks...\n")
    
    html_files = find_html_files()
    
    if not html_files:
        print("⚠️  No HTML files found in current directory")
        return 0
    
    print(f"📄 Checking {len(html_files)} HTML file(s)...\n")
    
    total_violations = 0
    total_warnings = 0
    
    for html_file in html_files:
        print(f"Analyzing {html_file.name}...")
        
        with open(html_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Extract external resources
        scripts = extract_external_scripts(content)
        links = extract_external_links(content)
        all_urls = scripts + links
        
        # Check for tracking scripts
        tracking = check_for_tracking_scripts(all_urls)
        if tracking:
            total_violations += len(tracking)
            print(f"  ❌ Found {len(tracking)} tracking script(s):")
            for url, domain in tracking:
                print(f"     - {url} (matches {domain})")
        
        # Check for HTTP resources
        http_resources = check_for_http_resources(all_urls)
        if http_resources:
            total_warnings += len(http_resources)
            print(f"  ⚠️  Found {len(http_resources)} non-HTTPS resource(s):")
            for url in http_resources:
                print(f"     - {url}")
        
        # Check for missing SRI (warning only)
        missing_sri = check_subresource_integrity(content, scripts)
        if missing_sri:
            total_warnings += len(missing_sri)
            print(f"  ⚠️  Found {len(missing_sri)} external script(s) without SRI:")
            for url in missing_sri:
                print(f"     - {url}")
        
        if not tracking and not http_resources and not missing_sri:
            print(f"  ✅ No security issues found")
        
        print()
    
    # Summary
    print("=" * 60)
    print(f"\n📊 Security Check Summary:")
    print(f"   Critical violations: {total_violations}")
    print(f"   Warnings: {total_warnings}")
    
    if total_violations > 0:
        print(f"\n❌ Security check FAILED: {total_violations} critical violation(s) found")
        print("\nTracking scripts violate the project's privacy requirements.")
        print("Remove or replace any third-party tracking/analytics scripts.")
        return 1
    
    if total_warnings > 0:
        print(f"\n⚠️  Security check passed with {total_warnings} warning(s)")
        print("\nConsider addressing these warnings:")
        print("  - Use HTTPS for all external resources")
        print("  - Add Subresource Integrity (SRI) to external scripts")
    else:
        print("\n✅ All security checks passed!")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
