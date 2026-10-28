"""Small layout promises, measured on the repository's local stack (TEST DATA, nothing hosted). No screenshots.
- This week: every date number sits in the same box and on the same line; today only changes colour.
- A short page such as Feedback shows its footer links without scrolling.
Usage: python3 scripts/check-compact-ui.py OUT_DIR"""
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module
helper = import_module('check-photo-editor')
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
WEEK = """() => [...document.querySelectorAll('.wk-day')].filter(d => d.getBoundingClientRect().width > 0).map(d => { const n = d.querySelector('.wk-n').getBoundingClientRect(), c = d.getBoundingClientRect();
  return {today: d.classList.contains('today'), h: Math.round(n.height * 10) / 10, w: Math.round(n.width * 10) / 10, cy: Math.round((n.top + n.height / 2) * 10) / 10, dx: Math.round(((n.left + n.width / 2) - (c.left + c.width / 2)) * 10) / 10} })"""
FOOT = """() => { const f = document.querySelector('footer.site-foot'); const r = f ? f.getBoundingClientRect() : null;
  const nav = document.querySelector('.bar .product-nav'), fixed = nav && getComputedStyle(nav).position === 'fixed';
  return {top: r && Math.round(r.top), bottom: r && Math.round(r.bottom), vh: innerHeight - (fixed ? Math.round(nav.getBoundingClientRect().height) : 0), links: f ? [...f.querySelectorAll('a')].filter(a => a.getBoundingClientRect().width > 0).length : 0} }"""
failures, result = [], {}
import os
proc = subprocess.Popen(['node', 'scripts/photo-editor-local-stack.mjs'], stdout=subprocess.PIPE, stderr=open(out / 'stack.log', 'w'), text=True, env={**os.environ, 'STRIVE_TEST_SAVED_RUNS': '1'})
try:
    stack = json.loads(proc.stdout.readline())
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for signed_in in (False, True):
            for width, height in ((1440, 900), (390, 844)):
                key = f"{'in' if signed_in else 'out'}_{width}"
                ctx = browser.new_context(viewport={'width': width, 'height': height}); page = ctx.new_page()
                if signed_in: page.add_init_script(helper.session_script(stack['casey'], 'test-casey'))
                page.goto(stack['site'] + '/'); page.wait_for_timeout(3000)
                days = page.evaluate(WEEK)
                page.goto(stack['site'] + '/?feedback'); page.wait_for_timeout(2500)
                foot = page.evaluate(FOOT)
                result[key] = {'week': days, 'feedback_footer': foot}; ctx.close()
                if not days:
                    failures.append(f'{key}: This week did not render')
                else:
                    if len({d['h'] for d in days}) > 1 or len({d['cy'] for d in days}) > 1:
                        failures.append(f"{key}: date boxes differ, heights {sorted({d['h'] for d in days})} centres {sorted({d['cy'] for d in days})}")
                    if any(abs(d['dx']) > 0.6 for d in days):
                        failures.append(f"{key}: a date is off its column centre by {max(abs(d['dx']) for d in days)} px")
                    today = [d for d in days if d['today']]
                    if today and (today[0]['w'] != today[0]['h'] or len({d['w'] for d in days if not d['today']} | {today[0]['w']}) > 1):
                        failures.append(f"{key}: today's pill is {today[0]['w']} by {today[0]['h']} px, other dates {sorted({d['w'] for d in days if not d['today']})} wide")
                    if not today:
                        failures.append(f'{key}: no day is marked today')
                if not foot['links'] or foot['top'] is None or foot['top'] + 44 > foot['vh']:
                    failures.append(f"{key}: Feedback footer starts at {foot['top']} px, below the {foot['vh']} px view")
        browser.close()
finally:
    proc.terminate()
result['failures'] = failures
json.dump(result, open(out / 'compact-ui.json', 'w'), indent=1)
print('\n'.join(failures) or 'Dates share one box and line; the Feedback footer is in view')
sys.exit(1 if failures else 0)
