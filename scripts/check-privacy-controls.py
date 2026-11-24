"""Who can see this: the audience control is visible and easy, and nothing narrower than Everyone leaks.
Runs the shipped site on the repository's local stack (TEST DATA, nothing hosted) at phone width.
Casey owns one run per audience; Riley follows Casey and is on her Close friends list.
Usage: python3 scripts/check-privacy-controls.py OUT_DIR [PREFIX]"""
import json, os, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module
helper = import_module('check-photo-editor')
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
prefix = sys.argv[2] if len(sys.argv) > 2 else 'privacy'
RUN = {'public': 'a2000000-0000-0000-0000-000000000071', 'link': 'a2000000-0000-0000-0000-000000000072',
       'close_friends': 'a2000000-0000-0000-0000-000000000073', 'private': 'a2000000-0000-0000-0000-000000000074'}
VIEW = {'width': 390, 'height': 844}
IN_VIEW = """sel => {const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e);
  return {top: r.top, bottom: r.bottom, height: r.height, text: e.textContent.trim().replace(/\\s+/g, ' '), shown: s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0,
    fontSize: parseFloat(s.fontSize), bg: s.backgroundColor}}"""
failures, seen = [], {}
proc = subprocess.Popen(['node', 'scripts/photo-editor-local-stack.mjs'], env={**os.environ, 'STRIVE_TEST_AUDIENCES': '1'},
                        stdout=subprocess.PIPE, stderr=open(out / f'{prefix}-stack.log', 'w'), text=True)


def first_screen(key, probe, label):
    """The control must be on the first phone screen, readable, and not under the fixed bottom bar."""
    if not probe or not probe['shown']:
        failures.append(f'{key}: {label} not shown'); return
    if probe['top'] < 0 or probe['bottom'] > VIEW['height'] - 72:
        failures.append(f'{key}: {label} is outside the first screen ({round(probe["top"])}px)')
    if probe['fontSize'] < 13:
        failures.append(f'{key}: {label} text is {probe["fontSize"]}px, too small to notice')


try:
    stack = json.loads(proc.stdout.readline())
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        def open_page(who, path):
            context = browser.new_context(viewport=VIEW, device_scale_factor=2)
            page = context.new_page()
            if who:
                page.add_init_script(helper.session_script(stack[who], 'test-' + who))
            page.goto(stack['site'] + path); page.locator('#app').wait_for(); page.wait_for_timeout(3000)
            return context, page

        def shot(page, name):
            page.screenshot(path=str(out / f'{prefix}-{name}.png'))

        # 1. Owner, each run page: the audience is the first thing on the card and opens the picker.
        for audience, run in RUN.items():
            key = f'owner-run-{audience}'
            context, page = open_page('casey', '/?run=' + run)
            probe = page.evaluate(IN_VIEW, '[data-audience-pill]')
            seen[key] = probe
            first_screen(key, probe, 'audience control')
            if audience == 'private':
                shot(page, 'owner-run-only-me')
                if probe and probe['shown']:
                    page.locator('[data-audience-pill]').first.click(); page.wait_for_timeout(1200)
                    options = page.evaluate("[...document.querySelectorAll('#audience-dialog input[name=audience]')].map(i=>({v:i.value,checked:i.checked}))")
                    seen['picker'] = options
                    if [o['v'] for o in options] != ['public', 'link', 'close_friends', 'private']:
                        failures.append('picker: expected four choices, widest first: ' + json.dumps(options))
                    if not any(o['v'] == 'private' and o['checked'] for o in options):
                        failures.append('picker: Only me is not preselected on an Only me run')
                    counts = page.evaluate("document.querySelector('#audience-dialog')?.textContent||''")
                    if '1 follower' not in counts or '1 person' not in counts:
                        failures.append('picker: follower and close friend counts missing')
                    shot(page, 'owner-picker')
                    # Widening needs an explicit choice and a button that names the new audience.
                    page.locator('#audience-dialog input[value=public]').check(); page.wait_for_timeout(200)
                    label = page.locator('#audience-dialog .aud-save').text_content()
                    if 'everyone' not in (label or '').lower():
                        failures.append(f'picker: save button does not name the wider audience: {label!r}')
                    page.locator('#audience-dialog .aud-cancel').click()
                    page.wait_for_timeout(300)
                    # The import review box opens the same picker.
                    approve = page.locator('[data-approve]')
                    if approve.count():
                        approve.first.click(); page.wait_for_timeout(1200)
                        if not page.locator('#audience-dialog[open]').count():
                            failures.append('review box: Choose visibility does not open the picker')
                        else:
                            page.locator('#audience-dialog .aud-cancel').click()
            context.close()

        # 2. Owner, post form: the audience is set before typing, on the first screen.
        context, page = open_page('casey', '/?post')
        probe = page.evaluate(IN_VIEW, '[data-audience-pill]'); seen['owner-post'] = probe
        first_screen('owner-post', probe, 'audience control')
        shot(page, 'owner-post')
        context.close()

        # 3. Owner, profile: a map of who sees what, on the first screen, with real counts.
        context, page = open_page('casey', '/?u=test-casey')
        probe = page.evaluate(IN_VIEW, '#profile-privacy'); seen['owner-profile'] = probe
        first_screen('owner-profile', probe, 'who-sees-what panel')
        if probe and probe['shown']:
            for word in ('Everyone', 'Followers', 'Close friends', 'Only me', '1 follower', 'Close friends: 1'):
                if word not in probe['text']:
                    failures.append(f'owner-profile: panel is missing {word!r}')
            if '2 more never show here' not in probe['text']:
                failures.append('owner-profile: panel does not say how many updates visitors cannot see')
        shot(page, 'owner-profile')
        context.close()

        # 4. Owner, Settings: a Privacy section with the four audiences and links to the lists.
        context, page = open_page('casey', '/?account#privacy')
        text = page.evaluate("document.querySelector('#privacy')?.textContent || ''"); seen['owner-settings'] = text[:400]
        for word in ('Privacy', 'Everyone', 'Followers', 'Close friends', 'Only me', 'Edit Close friends', 'See it as a visitor'):
            if word not in text:
                failures.append(f'owner-settings: Privacy section is missing {word!r}')
        if 'TEST DATA Riley' not in text:
            failures.append('owner-settings: follower list does not name the follower')
        shot(page, 'owner-settings')
        context.close()

        # 4b. Owner, ordinary Settings with no anchor: both privacy actions sit on the first screen.
        # The #privacy anchor above scrolls the page and hid this gap once (Codex check, 13 Nov).
        context, page = open_page('casey', '/?account')
        seen['settings-no-anchor-scroll-y'] = page.evaluate('window.scrollY')
        if seen['settings-no-anchor-scroll-y'] != 0:
            failures.append(f'settings-no-anchor: page opened scrolled to {seen["settings-no-anchor-scroll-y"]}px')
        for key, sel, name in (('settings-no-anchor-friends', '#privacy a[href="/?friends"]', 'Edit Close friends'),
                               ('settings-no-anchor-visitor', '#privacy a[href*="preview=public"]', 'See it as a visitor')):
            probe = page.evaluate(IN_VIEW, sel); seen[key] = probe
            first_screen(key, probe, name)
            if probe and name not in probe['text']:
                failures.append(f'{key}: action reads {probe["text"]!r}, expected {name!r}')
        shot(page, 'owner-settings-no-anchor')
        context.close()

        # 5. Leaks: preview, signed out and a close friend see only what they may.
        for key, who, path, allowed in (
                ('owner-preview', 'casey', '/?u=test-casey&preview=public', {'public'}),
                ('signed-out', None, '/?u=test-casey', {'public'}),
                ('close-friend', 'riley', '/?u=test-casey', {'public', 'close_friends'})):
            context, page = open_page(who, path)
            html = page.content()
            leaked = [a for a, run in RUN.items() if a not in allowed and run in html]
            seen[key] = {'leaked': leaked, 'panel': '#profile-privacy' in html or 'id="profile-privacy"' in html}
            if leaked:
                failures.append(f'{key}: profile page contains runs it must not: {leaked}')
            if 'id="profile-privacy"' in html:
                failures.append(f'{key}: owner privacy panel rendered for a visitor or in preview')
            shot(page, key)
            context.close()
        # 6. Saves, end to end on the local database: the picker writes, the reader rules follow.
        # Close friends, not Followers: Followers access rides a request header this local stub does not
        # pass to the database, so a follower is refused here even on the live code.
        context, page = open_page('casey', '/?run=' + RUN['private'])
        page.locator('[data-audience-pill]').first.click(); page.wait_for_timeout(1000)
        page.locator('#audience-dialog input[value=close_friends]').check()
        page.locator('#audience-dialog .aud-save').click(); page.wait_for_timeout(2500)
        saved = page.evaluate("document.querySelector('[data-run-id] [data-audience-pill]')?.dataset.audiencePill || null")
        seen['save-run'] = saved
        if saved != 'close_friends':
            failures.append(f'save-run: Only me to Close friends did not save and repaint (shows {saved!r})')
        shot(page, 'owner-run-saved-close-friends')
        context.close()
        for key, who, may in (('save-run-close-friend', 'riley', True), ('save-run-signed-out', None, False)):
            context, page = open_page(who, '/?run=' + RUN['private'])
            opened = page.locator('.run-detail-card').count() > 0
            seen[key] = opened
            if opened != may:
                failures.append(f'{key}: expected {"open" if may else "refused"} after the save, got {"open" if opened else "refused"}')
            context.close()
        context, page = open_page('casey', '/?post')
        page.fill('#f_project', 'TEST DATA privacy post'); page.fill('#f_caption', 'TEST DATA description for the audience save check')
        page.locator('#post-audience-slot [data-audience-pill]').click(); page.wait_for_timeout(1000)
        page.locator('#audience-dialog input[value=close_friends]').check()
        page.locator('#audience-dialog .aud-save').click(); page.wait_for_timeout(500)
        button = page.locator('#publish').text_content()
        seen['post-button'] = button
        if 'close friends' not in (button or '').lower():
            failures.append(f'save-post: the post button does not name the chosen audience: {button!r}')
        page.locator('#publish').click(); page.wait_for_timeout(4000)
        stored = page.evaluate("document.querySelector('[data-run-visibility]')?.dataset.runVisibility || null")
        seen['save-post'] = {'url': page.url, 'stored': stored}
        if stored != 'close_friends':
            failures.append(f'save-post: the new update is not stored for Close friends (got {stored!r} at {page.url})')
        shot(page, 'owner-post-saved')
        context.close()
        browser.close()
finally:
    proc.terminate(); proc.wait(timeout=10)
(out / f'{prefix}-result.json').write_text(json.dumps({'pass': not failures, 'failures': failures, 'seen': seen}, indent=2) + '\n')
print(json.dumps({'pass': not failures, 'failures': failures}, indent=1))
sys.exit(1 if failures else 0)
