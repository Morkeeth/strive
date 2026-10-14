"""People who follow 'Read the editor plugin instructions' get a page with working links (First Users connect run,
14 Oct, finding 3: /plugins/install.md is served as text/markdown, Chromium shows it as text with 0 links, so its
'Open the visual install page' line could not be clicked)."""
import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('plugin_install_page', ROOT / 'scripts' / 'plugin_install_page.py')
page = importlib.util.module_from_spec(spec)
spec.loader.exec_module(page)

SAMPLE = '''# Install STRIVE

[Open the visual install page](https://striverun.app/install).

Press **Save run** in STRIVE. Run `/strive:strive`.

```sh
claude plugin install strive@strive <x>
```

[bad](javascript:alert(1)) <script>alert(1)</script>
'''


def test_links_become_real_links():
    html = page.render(SAMPLE)
    assert '<a href="https://striverun.app/install">Open the visual install page</a>' in html
    assert '<h1>Install STRIVE</h1>' in html
    assert '<strong>Save run</strong>' in html and '<code>/strive:strive</code>' in html
    assert '<pre><code>claude plugin install strive@strive &lt;x&gt;\n</code></pre>' in html


def test_unsafe_input_stays_text():
    html = page.render(SAMPLE)
    assert '<script>' not in html and 'href="javascript:' not in html
    assert '&lt;script&gt;' in html


def test_build_writes_the_html_twin():
    build = (ROOT / 'scripts' / 'build-native-plugin.py').read_text()
    assert "out/'install.html'" in build and 'plugin_install_page' in build


def test_people_get_the_html_guide_and_agents_keep_markdown():
    install = (ROOT / 'site' / 'install.html').read_text()
    human = re.search(r'<a href="([^"]+)">Read the editor plugin instructions</a>', install).group(1)
    assert human == '/plugins/install'
    assert '<a href="/plugins/install.md">plain-text install guide</a>' in install


def test_commands_wrap_on_a_phone():
    assert 'pre{white-space:pre-wrap;overflow-wrap:anywhere' in page.render(SAMPLE)
