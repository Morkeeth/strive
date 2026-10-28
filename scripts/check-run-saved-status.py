"""After save, the owner's run page shows one compact status line with icon tools, and no empty XUDOS block.
Runs the shipped site on the repository's local stack (TEST DATA, nothing hosted). No screenshots.
Usage: python3 scripts/check-run-saved-status.py OUT_DIR"""
import json, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module
helper = import_module('check-photo-editor')
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
RUNS = {'with_xudos': 'a2000000-0000-0000-0000-000000000081', 'no_xudos': 'a2000000-0000-0000-0000-000000000082', 'private': 'a2000000-0000-0000-0000-000000000083'}
READ = """() => { const t = e => e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; const s = document.querySelector('.run-primary-actions');
  return {status: t(s?.querySelector('b')), tools: [...(s?.querySelectorAll('.icon-act') || [])].map(e => [e.tagName, e.getAttribute('aria-label'), t(e)]),
    worded: [...(s?.querySelectorAll('a.act, button.act') || [])].map(t), statusHeight: s ? Math.round(s.getBoundingClientRect().height) : null,
    xudosBlock: t(document.querySelector('.run-xudos summary')) || (document.querySelector('.run-xudos') ? 'present' : null),
    emptyXudos: document.body.innerText.includes('No XUDOS yet'), actionRow: !!document.querySelector('[data-run-id] .fc-actions, [data-run-id] .actions, [data-run-id] [data-ack]')} }"""
failures, result = [], {}
def check(name, ok, detail):
    if not ok: failures.append(f'{name}: {detail}')
proc = subprocess.Popen(['node', 'scripts/photo-editor-local-stack.mjs'], stdout=subprocess.PIPE, stderr=open(out / 'stack.log', 'w'), text=True, env={**os.environ, 'STRIVE_TEST_SAVED_RUNS': '1'})
try:
    stack = json.loads(proc.stdout.readline())
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width in (1440, 390):
            ctx = browser.new_context(viewport={'width': width, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
            page = ctx.new_page(); page.add_init_script(helper.session_script(stack['casey'], 'test-casey'))
            for name, run in RUNS.items():
                page.goto(f"{stack['site']}/?run={run}"); page.locator('.run-primary-actions').wait_for(); page.wait_for_timeout(1500)
                seen = page.evaluate(READ); key = f'{name}_{width}'
                if name != 'private':
                    page.locator('#run-copy-link').click(); page.wait_for_timeout(200)
                    seen['copied'] = page.evaluate("[document.getElementById('run-copy-state')?.textContent, document.getElementById('run-copy-link')?.getAttribute('aria-label')]")
                    seen['clipboard'] = page.evaluate('navigator.clipboard.readText()')
                result[key] = seen
                if name == 'private':
                    check(key, not seen['tools'] and 'Choose who can see this' in seen['worded'], f"private run must keep the worded audience control, saw {seen}")
                else:
                    check(key, seen['status'] == 'Saved to Public feed and profile', seen['status'])
                    check(key, [x[1] for x in seen['tools']] == ['Copy public link', 'Open shared post'] and not seen['worded'], f"tools {seen['tools']} worded {seen['worded']}")
                    check(key, seen['copied'] == ['Link copied', 'Link copied'] and seen['clipboard'].startswith(stack['site'] + '/') and len(seen['clipboard']) > len(stack['site']) + 1, f"copy {seen.get('copied')} {seen.get('clipboard')}")
                    check(key, seen['statusHeight'] is not None and seen['statusHeight'] <= 120, f"status block {seen['statusHeight']} px tall")
                check(key, not seen['emptyXudos'], 'empty XUDOS block still shown')
                if name == 'with_xudos':
                    check(key, seen['xudosBlock'] == 'XUDOS from 1 person', f"xudos block {seen['xudosBlock']}")
                else:
                    check(key, seen['xudosBlock'] is None, f"xudos block {seen['xudosBlock']}")
            ctx.close()
        browser.close()
finally:
    proc.terminate()
result['failures'] = failures
json.dump(result, open(out / 'run-saved-status.json', 'w'), indent=1)
print('\n'.join(failures) or 'Saved status is one compact line with icon tools; XUDOS list only when someone sent one')
sys.exit(1 if failures else 0)
