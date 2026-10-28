"""Connect your agent shows only what STRIVE has on record, and the import steps move when an agent is chosen.
Runs the shipped site on the repository's local stack (TEST DATA, nothing hosted). No screenshots.
Usage: python3 scripts/check-connect-connections.py OUT_DIR"""
import json, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module
helper = import_module('check-photo-editor')
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
READ = """() => { const box = document.getElementById('connect-connections'); const t = e => e ? e.textContent.replace(/\\s+/g, ' ').trim() : null;
  return {present: !!box, text: t(box), keys: box ? [...box.querySelectorAll('.connect-token strong')].map(t) : [],
    manage: box?.querySelector('a[href="/?connect=auto"]') ? true : false, add: box?.querySelector('[data-connections-add]') ? true : false,
    steps: [...document.querySelectorAll('.post-start .post-flow-steps li')].map(li => (li.classList.contains('is-done') ? 'done:' : li.getAttribute('aria-current') ? 'now:' : '') + t(li)),
    cards: [...document.querySelectorAll('[data-post-source] span:last-child')].map(t)} }"""
failures, result = [], {}
def check(name, ok, detail):
    if not ok: failures.append(f'{name}: {detail}')
for mode in ('fresh', 'used', 'keys'):
    env = {**os.environ, 'STRIVE_TEST_CONNECTIONS': mode} if mode != 'fresh' else dict(os.environ)
    proc = subprocess.Popen(['node', 'scripts/photo-editor-local-stack.mjs'], stdout=subprocess.PIPE, stderr=open(out / f'stack-{mode}.log', 'w'), text=True, env=env)
    try:
        stack = json.loads(proc.stdout.readline())
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for signed_in in ((False, True) if mode == 'fresh' else (True,)):
                for broken in ((False, True) if mode == 'keys' else (False,)):
                    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}); page = ctx.new_page()
                    if signed_in: page.add_init_script(helper.session_script(stack['casey'], 'test-casey'))
                    if broken: page.route('**/rpc/agent_token_list*', lambda r: r.fulfill(status=500, body='{"message":"TEST DATA failure"}'))
                    page.goto(stack['site'] + '/?connect'); page.locator('.post-source-grid').wait_for(); page.wait_for_timeout(2500)
                    seen = page.evaluate(READ)
                    page.locator('[data-post-source="codex"]').click(); page.wait_for_timeout(300)
                    seen['steps_after_pick'] = page.evaluate(READ)['steps']
                    key = f"{mode}_{'in' if signed_in else 'out'}{'_failed' if broken else ''}"
                    result[key] = seen; ctx.close()
                    check(key, all(c == 'Copy a Terminal command' for c in seen['cards'][:3]), f"card text {seen['cards'][:3]}")
                    check(key, seen['steps'][0].startswith('now:') and seen['steps_after_pick'][0].startswith('done:') and seen['steps_after_pick'][1].startswith('now:'), f"steps {seen['steps']} -> {seen['steps_after_pick']}")
                    if not signed_in:
                        check(key, not seen['present'], 'connections panel shown while signed out'); continue
                    check(key, seen['present'] and seen['manage'] and seen['add'], 'panel or its actions missing')
                    text = seen['text'] or ''
                    if broken:
                        check(key, 'could not load' in text and not seen['keys'], text)
                    elif mode == 'fresh':
                        check(key, 'No agent is connected to your account yet' in text and not seen['keys'], text)
                    elif mode == 'keys':
                        check(key, seen['keys'] == ['TEST DATA laptop'] and 'No agent has uploaded with these keys yet' in text and '2 revoked or expired keys' in text, text)
                    else:
                        check(key, 'Last agent upload: TEST DATA agent upload' in text and 'session import' not in text, text)
            browser.close()
    finally:
        proc.terminate()
result['failures'] = failures
json.dump(result, open(out / 'connect-connections.json', 'w'), indent=1)
print('\n'.join(failures) or 'Connect shows recorded keys and uploads only, and its steps advance')
sys.exit(1 if failures else 0)
