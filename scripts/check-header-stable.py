"""The header Add run button must not move while sign-in is restored or between pages.
Samples its box every frame on the repository's local stack (TEST DATA, nothing hosted), signed in and out, 1440 and 390.
The first load of a context may move a few pixels while the web font arrives; every later load must hold one position.
Usage (after npm run build): python3 scripts/check-header-stable.py OUT_DIR"""
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, 'scripts')
from importlib import import_module
helper = import_module('check-photo-editor')
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
SAMPLER = """(() => { window.__addX = []; const tick = () => { const a = document.querySelector('.global-add');
  if (a) { const r = a.getBoundingClientRect(), s = getComputedStyle(a);
    window.__addX.push({t: Math.round(performance.now()), x: Math.round(r.left*10)/10, w: Math.round(r.width*10)/10, shown: s.display !== 'none' && r.width > 0,
      cw: document.documentElement.clientWidth, right: [...document.querySelectorAll('.bar .right > *')].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => (e.id || e.className.split(' ')[0]) + ':' + Math.round(e.getBoundingClientRect().width))}); }
  requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()"""
ROUTES = ['/', '/?connect', '/?post', '/?mine']
proc = subprocess.Popen(['node', 'scripts/photo-editor-local-stack.mjs'], stdout=subprocess.PIPE, stderr=open(out / 'stack.log', 'w'), text=True)
result = {}
try:
    stack = json.loads(proc.stdout.readline())
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for signed_in in (False, True):
            for width in (1440, 390):
                key = f"{'in' if signed_in else 'out'}_{width}"
                ctx = browser.new_context(viewport={'width': width, 'height': 900})
                page = ctx.new_page()
                if signed_in:
                    page.add_init_script(helper.session_script(stack['casey'], 'test-casey'))
                page.add_init_script(SAMPLER)
                rows = {}
                for route in ROUTES:
                    page.goto(stack['site'] + route); page.wait_for_timeout(2500)
                    rows['load ' + route] = page.evaluate('window.__addX')
                # In-app menu transitions without reload
                for label, sel in (('click Feed', '.product-nav-link[data-nav-page=feed]'), ('click Connect', '.global-connect'), ('click Add run', '.global-add')):
                    page.evaluate('window.__addX = []')
                    loc = page.locator(sel)
                    if loc.count() and loc.first.is_visible():
                        loc.first.click(); page.wait_for_timeout(2000)
                        rows[label] = page.evaluate('window.__addX || []')
                summary = {}
                for k, v in rows.items():
                    shown = [s for s in v if s['shown']]
                    xs = sorted({s['x'] for s in shown})
                    summary[k] = {'frames': len(v), 'distinct_x': xs, 'cw': sorted({s['cw'] for s in v}),
                                  'right_sets': sorted({','.join(s['right']) for s in v})}
                result[key] = summary
                ctx.close()
        browser.close()
finally:
    proc.terminate()
failures = []
for key, summ in result.items():
    later = [r for k, r in summ.items() if k != 'load /']
    xs = sorted({x for r in later for x in r['distinct_x']})
    if len(xs) > 1:
        failures.append(f'{key}: Add run moved between {xs[0]} and {xs[-1]} px')
result['failures'] = failures
json.dump(result, open(out / 'header-stable.json', 'w'), indent=1)
print('\n'.join(failures) or 'Add run held one position on every later load and click')
sys.exit(1 if failures else 0)
