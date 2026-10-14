"""Read-only, SHA-bound public Feed timing; append JSON history and a CSV trend."""
import argparse
import asyncio
import csv
import json
import math
import os
import re
import statistics
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROFILES = [('desktop', 1440, 900, False), ('phone-4g', 390, 844, True)]
METHOD = 'feed-cold-v1-3-samples-phone150ms-200000Bps-4xcpu'


def sha(value):
    if not re.fullmatch(r'[0-9a-f]{40}', value or ''):
        raise ValueError('Expected a full git SHA.')
    return value


def health(origin, expected):
    with urllib.request.urlopen(origin + '/api/health', timeout=20) as response:
        observed = json.load(response).get('git_sha')
    if observed != expected:
        raise ValueError('Live SHA differs from the deployment; no timing will be attributed to it.')
    return observed


def aggregate(samples):
    if len(samples) != 3 or any(not isinstance(s.get('lcp_ms'), (float, int)) or not math.isfinite(s['lcp_ms']) or s['lcp_ms'] <= 0 for s in samples):
        raise ValueError('Three real positive LCP observations are required; a missing paint is not zero.')
    return {key: round(statistics.median(s[key] for s in samples), 2)
            for key in ['lcp_ms', 'ttfb_ms', 'external_script_encoded_bytes', 'stylesheet_encoded_bytes', 'supabase_requests']}


def store(out, record, previous=None):
    rows = []
    if previous and Path(previous).exists():
        if Path(previous).stat().st_size > 10_000_000:
            raise ValueError('Previous history is too large; preserve it and investigate before appending.')
        rows = json.loads(Path(previous).read_text())
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError('Previous history is invalid.')
    # Keep reruns distinct and preserve their outcome, including failures.
    record['prior_entries'] = len(rows)
    record['history_continuity'] = 'restored' if previous and Path(previous).exists() else 'new-no-retained-snapshot'
    rows.append(record)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'measurement.json').write_text(json.dumps(record, indent=2) + '\n')
    (out / 'history.json').write_text(json.dumps(rows, indent=2) + '\n')
    with (out / 'history.csv').open('w', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['measured_at', 'sha', 'deployment', 'workflow_run', 'method', 'status', 'desktop_lcp_ms', 'phone_lcp_ms'])
        for row in rows:
            metrics = row.get('profiles', {})
            writer.writerow([row.get('measured_at'), row.get('sha'), row.get('deployment'), row.get('workflow_run'), row.get('method'), row.get('status'), metrics.get('desktop', {}).get('lcp_ms'), metrics.get('phone-4g', {}).get('lcp_ms')])


async def measure(origin, expected):
    from playwright.async_api import async_playwright
    result = {}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            for name, width, height, slow in PROFILES:
                samples = []
                for _ in range(3):
                    context = await browser.new_context(viewport={'width': width, 'height': height}, service_workers='block')
                    try:
                        page = await context.new_page()
                        cdp = await context.new_cdp_session(page)
                        await cdp.send('Network.enable')
                        await cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
                        if slow:
                            await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 200000, 'uploadThroughput': 93750})
                            await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
                        await page.add_init_script("new PerformanceObserver(l=>{window.striveLCP=l.getEntries().at(-1).startTime}).observe({type:'largest-contentful-paint',buffered:true})")
                        await page.goto(origin + '/', wait_until='load', timeout=60000)
                        await page.locator('#landing-feature-body article, #landing-feature-body .home-none').first.wait_for(timeout=30000)
                        await page.wait_for_load_state('networkidle', timeout=30000)
                        await page.wait_for_timeout(1500)
                        observed = await page.locator('meta[name="strive-git-sha"]').get_attribute('content')
                        if observed != expected:
                            raise ValueError('Page SHA differs from the deployment; no timing will be attributed to it.')
                        sample = await page.evaluate("""()=>{const n=performance.getEntriesByType('navigation')[0],r=performance.getEntriesByType('resource');return {lcp_ms:window.striveLCP??null,ttfb_ms:n.responseStart,external_script_encoded_bytes:r.filter(x=>x.initiatorType==='script'||/\\.m?js(?:\\?|$)/.test(x.name)).reduce((n,x)=>n+x.encodedBodySize,0),stylesheet_encoded_bytes:r.filter(x=>/\\.css(?:\\?|$)/.test(x.name)).reduce((n,x)=>n+x.encodedBodySize,0),supabase_requests:r.filter(x=>new URL(x.name).hostname.endsWith('.supabase.co')).length}}""")
                        samples.append(sample)
                    finally:
                        await context.close()
                result[name] = {**aggregate(samples), 'samples': samples, 'viewport': [width, height], 'signed_in': False}
        finally:
            await browser.close()
    # A production alias may move while a check runs. Refuse a mixed-version history entry.
    health(origin, expected)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sha', required=True, type=sha)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--previous', type=Path)
    parser.add_argument('--origin', default='https://striverun.app', choices=['https://striverun.app'])
    args = parser.parse_args(argv)
    record = {'measured_at': datetime.now(timezone.utc).isoformat(), 'sha': args.sha,
              'deployment': os.getenv('DEPLOYMENT_ID'), 'workflow_run': os.getenv('GITHUB_RUN_ID'),
              'attempt': os.getenv('GITHUB_RUN_ATTEMPT'), 'method': METHOD, 'status': 'failed'}
    code = 0
    try:
        health(args.origin, args.sha)
        record['profiles'] = asyncio.run(measure(args.origin, args.sha))
        record['status'] = 'measured'
    except Exception as error:
        # Exception messages can include query strings; only the failure class is persisted.
        record['error_type'] = type(error).__name__
        code = 1
    store(args.out, record, args.previous)
    print(json.dumps(record))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
