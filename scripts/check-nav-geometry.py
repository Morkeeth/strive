"""Exercise the real app routes on a running preview, without mocked views or API responses.
Example: python3 scripts/check-nav-geometry.py --base-url http://127.0.0.1:8128
"""
import argparse
import json
from datetime import date
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', required=True)
parser.add_argument('--output', default='/tmp/strive-nav-proof')
args = parser.parse_args()
base = args.base_url.rstrip('/')
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
routes = [('feed', '/'), ('mine', '/?mine'), ('discover', '/?explore'),
          ('following', '/?following'), ('people', '/?people'), ('boards', '/?boards'),
          ('day', '/?day='+date.today().isoformat()), ('projects', '/?projects')]
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in [1280, 390, 320]:
        page = browser.new_page(viewport={'width': width, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for name, path in routes:
            page.goto(base+path, wait_until='networkidle')
            page.locator('#app h1, #app h2, #app h3').first.wait_for()
            result = page.evaluate('''() => ({
                menus: document.querySelectorAll('#product-nav').length,
                oldMenus: document.querySelectorAll('.desktop-nav,.tabbar,#rail nav,.feed-tabs,.section-tabs[aria-label="My runs"],.section-tabs[aria-label="Community"]').length,
                primary: [...document.querySelectorAll('.product-nav-link>span')].map(e=>e.textContent),
                selected: [...document.querySelectorAll('#product-nav [aria-current="page"]')].map(e=>e.dataset.navPage),
                appX: document.querySelector('#app').getBoundingClientRect().x,
                overflow: document.documentElement.scrollWidth > innerWidth,
                targets: [...document.querySelectorAll('.product-nav-link,.product-nav-more>summary')].map(e=>{const b=e.getBoundingClientRect();return {width:b.width,height:b.height}})
            })''')
            result.update(width=width, route=name)
            results.append(result)
            assert result['menus'] == 1 and result['oldMenus'] == 0, result
            assert result['primary'] == ['Feed', 'My runs', 'Discover'], result
            assert result['selected'] == [name], result
            assert not result['overflow'], result
            assert all(t['height'] >= 44 for t in result['targets']), result
            if width < 761:
                assert all(t['width'] >= 44 for t in result['targets']), result
            page.screenshot(path=str(out/f'{width}-{name}.png'))
            print(f'{width} {name}: one menu, exact destination, no overflow', flush=True)
        assert len({r['appX'] for r in results if r['width'] == width}) == 1, results
        # All destinations remain reachable by ordinary links. Browser history owns navigation.
        page.goto(base, wait_until='networkidle')
        for group, destination in [('feed','following'), ('mine','day'), ('discover','people'), ('discover','boards')]:
            summary = page.locator(f'[data-nav-group="{group}"] summary')
            summary.click()
            panel = page.locator('details.product-nav-more[open] .product-nav-panel')
            assert panel.is_visible()
            assert not page.locator('.feedback-launch').is_visible(), 'Feedback overlaps the open menu'
            box = panel.bounding_box()
            assert box['x'] >= 0 and box['x']+box['width'] <= width, box
            page.keyboard.press('Escape')
            assert page.locator('details.product-nav-more[open]').count() == 0
            assert summary.evaluate('(el)=>document.activeElement===el')
            summary.click()
            page.locator('.mark').click()
            page.wait_for_load_state('networkidle')
            assert page.locator('details.product-nav-more[open]').count() == 0
            summary.click()
            page.locator(f'#product-nav [data-nav-page="{destination}"]').click()
            page.wait_for_load_state('networkidle')
            assert page.locator('#product-nav [aria-current="page"]').get_attribute('data-nav-page') == destination
            assert page.locator('details.product-nav-more[open]').count() == 0
            page.reload(wait_until='networkidle')
            assert page.locator('#product-nav [aria-current="page"]').get_attribute('data-nav-page') == destination
            page.go_back(wait_until='networkidle')
            assert page.locator('#product-nav [aria-current="page"]').get_attribute('data-nav-page') == 'feed'
        assert not errors, errors
        page.close()
    browser.close()
(out/'results.json').write_text(json.dumps(results, indent=2))
print('PASS: real routes, one shared menu, exact selection, keyboard dismissal, back/reload, 320/390/1280 layout. No API writes or mocked reads.')
