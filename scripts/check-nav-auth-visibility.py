"""Header links that only make sense signed in stay out of view and out of tab order when signed out.
Runs the shipped site on the repository's local stack (TEST DATA, nothing hosted), at 1440 and 390.
Usage: python3 scripts/check-nav-auth-visibility.py OUT_DIR"""
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module
helper = import_module('check-photo-editor')
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
PROBE = """sel => [...document.querySelectorAll(sel)].map(e => {const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return {hidden: e.hidden, display: s.display, width: r.width, shown: s.display !== 'none' && r.width > 0}})"""
proc = subprocess.Popen(['node', 'scripts/photo-editor-local-stack.mjs'], stdout=subprocess.PIPE, stderr=open(out / 'stack.log', 'w'), text=True)
result, failures = {}, []
try:
    stack = json.loads(proc.stdout.readline())
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for signed_in in (False, True):
            for width in (1440, 390):
                context = browser.new_context(viewport={'width': width, 'height': 900})
                page = context.new_page()
                if signed_in:
                    page.add_init_script(helper.session_script(stack['casey'], 'test-casey'))
                page.goto(stack['site'] + '/'); page.locator('#app').wait_for(); page.wait_for_timeout(2500)
                seen = {'profile': page.evaluate(PROBE, '#profile-link'), 'connect': page.evaluate(PROBE, '.global-connect')}
                # Tab through the header: a hidden link must never take focus.
                focused = []
                for _ in range(12):
                    page.keyboard.press('Tab')
                    focused.append(page.evaluate("document.activeElement?.id || document.activeElement?.className || ''"))
                seen['tab_order'] = focused
                key = f"{'signed_in' if signed_in else 'signed_out'}_{width}"
                result[key] = seen
                profile_shown = any(x['shown'] for x in seen['profile']); connect_shown = any(x['shown'] for x in seen['connect'])
                if not signed_in:
                    if profile_shown: failures.append(key + ': profile link shown while signed out')
                    if connect_shown: failures.append(key + ': Connect agent shown while signed out')
                    if any(f in ('profile-link',) or 'global-connect' in str(f) for f in focused): failures.append(key + ': hidden link took focus')
                else:
                    if not profile_shown: failures.append(key + ': avatar profile link missing when signed in')
                    if width == 1440 and not connect_shown: failures.append(key + ': Connect agent missing beside Add run')
                    if width == 390:
                        page.locator('#account-menu > summary').click(); page.wait_for_timeout(300)
                        menu = page.evaluate("[...document.querySelectorAll('[data-you-links] [role=menuitem]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent.trim())")
                        seen['phone_menu'] = menu
                        if 'Connect your agent' not in menu: failures.append(key + ': phone menu lost Connect your agent')
                page.screenshot(path=str(out / f'{key}.png'), clip={'x': 0, 'y': 0, 'width': width, 'height': 120})
                context.close()
        browser.close()
finally:
    proc.terminate(); proc.wait(timeout=10)
(out / 'nav-auth-visibility.json').write_text(json.dumps({'pass': not failures, 'failures': failures, 'seen': result}, indent=2) + '\n')
print(json.dumps({'pass': not failures, 'failures': failures}, indent=1))
sys.exit(1 if failures else 0)
