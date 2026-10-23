"""Render the plain-text plugin install guide as a small HTML page for people.

Agents keep /plugins/install.md. Browsers show that file as text, so its links cannot be clicked.
Only the Markdown the guide uses is supported: headings, paragraphs, fenced code, `code`, **bold**
and [text](url) links. Everything is escaped first; a link survives only for https, / or cursor:// targets.
"""
import html
import re

SAFE_HREF = re.compile(r'^(https://|/|cursor://)')


def _inline(text):
    out = html.escape(text, quote=False)
    out = re.sub(r'`([^`]+)`', r'<code>\1</code>', out)
    out = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', out)

    def link(match):
        label, href = match.group(1), html.unescape(match.group(2))
        if not SAFE_HREF.match(href):
            return match.group(0)
        return '<a href="' + html.escape(href, quote=True) + '">' + label + '</a>'
    return re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', link, out)


def render_body(markdown):
    parts, para, code = [], [], None
    def flush():
        if para:
            parts.append('<p>' + _inline(' '.join(para)) + '</p>')
            para.clear()
    for line in markdown.split('\n'):
        if code is not None:
            if line.startswith('```'):
                parts.append('<pre><code>' + html.escape(''.join(code), quote=False) + '</code></pre>')
                code = None
            else:
                code.append(line + '\n')
        elif line.startswith('```'):
            flush(); code = []
        elif m := re.match(r'^(#{1,3}) (.+)$', line):
            flush(); n = len(m.group(1))
            parts.append(f'<h{n}>' + _inline(m.group(2)) + f'</h{n}>')
        elif not line.strip():
            flush()
        else:
            para.append(line.strip())
    flush()
    return '\n'.join(parts)


def render(markdown):
    return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Install the STRIVE plugin</title><link rel="stylesheet" href="/design.css">'
            '<link rel="icon" href="/favicon.svg" type="image/svg+xml">'
            # Commands wrap on a phone instead of pushing the page sideways.
            '<style>.install-page main{max-width:760px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--box);padding:12px;border-radius:8px}main a,main code{overflow-wrap:anywhere}</style></head>\n'
            '<body class="reading-page install-page"><header><a href="/">STRIVE</a></header><main>\n'
            + render_body(markdown) +
            '\n<p class="muted">For agents and command-line readers: <a href="/plugins/install.md">plain-text version</a>.</p>'
            '\n</main><footer class="site-foot"><a href="/install">Install</a><a href="/agents.md">For agents</a>'
            '<a href="/privacy">Privacy</a><a href="/?feedback">Feedback</a></footer></body></html>\n')
