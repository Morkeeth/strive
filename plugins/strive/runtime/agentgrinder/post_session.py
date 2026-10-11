"""Offline post-session studio. Uses only the immutable reviewed metrics."""
import html
import json
from pathlib import Path


def render(drafts, groups, preview_url):
    e = html.escape
    # JSON is data, even when a public project name contains HTML punctuation.
    data = json.dumps({'runs': drafts, 'groups': groups}, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    script = (Path(__file__).parent / 'assets/post-session.js').read_text()
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>STRIVE · Your session</title>
<style>
:root{--blue:#0047ff;--wash:#f2f5ff;--ink:#202027;--muted:#64646d;--line:#e3e3df}
*{box-sizing:border-box}body{margin:0;background:#f6f6f5;color:var(--ink);font:15px/1.5 system-ui,sans-serif}
header{background:white;border-bottom:1px solid var(--line);padding:20px max(20px,calc((100vw - 1100px)/2));display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{color:var(--blue);font-size:26px;font-weight:850;letter-spacing:-1px}header span{color:var(--muted);font-size:13px}
main{max-width:1100px;margin:32px auto;padding:0 20px}h1{font-size:32px;letter-spacing:-1px;margin:0 0 8px}p{margin:8px 0 20px;color:var(--muted)}
.studio{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.85fr);gap:32px;align-items:start}
.preview{min-width:0}canvas{display:block;width:100%;height:auto;background:white;border:1px solid var(--line);border-radius:8px}
form{padding:24px;background:white;border:1px solid var(--line);border-radius:8px}label,legend{display:block;font-weight:600;font-size:13px;margin-bottom:6px}
input,select,textarea{font:inherit;color:inherit;max-width:100%;width:100%;padding:11px;border:1px solid #d6d6db;border-radius:5px;background:white;margin-bottom:18px}textarea{resize:vertical;min-height:84px}
fieldset{border:0;padding:0;margin:0 0 18px}.toggle{display:flex;align-items:center;gap:10px;font-weight:400;min-height:32px;margin:0}.toggle input{width:18px;height:18px;margin:0;accent-color:var(--blue)}
button,.primary{min-height:44px;border:0;border-radius:5px;padding:12px 16px;font:600 14px system-ui;cursor:pointer;background:var(--blue);color:white;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
button:disabled{opacity:.4;cursor:default}.quiet{color:var(--ink);background:#f0f0f2}.nav{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.nav span{font-size:13px;color:var(--muted)}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.note{font-size:12px;color:var(--muted)}details{margin:24px 0;background:white;padding:18px;border:1px solid var(--line);border-radius:6px}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}a{color:var(--blue)}
:focus-visible{outline:3px solid #789bff;outline-offset:3px}#status{min-height:24px}#photo{font-size:12px}.project-facts{padding-top:10px}.project-facts p{font-size:13px;margin:6px 0}
@media(max-width:700px){main{margin:22px auto;padding:0 14px}.studio{grid-template-columns:minmax(0,1fr);gap:18px}form{padding:18px}h1{font-size:27px}header{padding:14px}.actions>*{flex:1}header span{font-size:11px}}
</style></head><body><header><a class="brand" href="#">STRIVE</a><span>Local preview · nothing uploaded</span></header><main>
<h1>Your session, ready to tell.</h1><p>Choose a project, add your words and pick the image you want to share.</p>
<div class="studio"><section class="preview" aria-label="Share card preview"><div class="nav"><button class="quiet" id="previous" aria-label="Previous project">←</button><span id="position" aria-live="polite"></span><button class="quiet" id="next" aria-label="Next project">→</button></div>
<canvas id="card" role="img" aria-label="Exact share image preview"></canvas><div class="actions"><button id="download">Download image</button><button class="quiet" id="copy">Copy caption</button></div><p id="status" class="note" role="status"></p>
<p class="note">An image download stays on this device. Saving to STRIVE and posting to social media are separate choices.</p></section>
<form id="editor"><label for="project">Project</label><select id="project"></select>
<label for="caption">What did you work on?</label><textarea id="caption" maxlength="180" placeholder="Your goal, what changed, or a question for people…"></textarea>
<label for="format">Image format</label><select id="format"><option value="portrait">Post · 1080 × 1350</option><option value="story">Story · 1080 × 1920</option><option value="square">Square · 1080 × 1080</option></select>
<label for="photo">Add your photo or screenshot</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp">
<label for="fit">Image fit</label><select id="fit"><option value="contain">Show whole image</option><option value="cover">Fill frame · crop edges</option></select><button class="quiet" id="remove-photo" type="button" hidden>Remove image</button>
<fieldset><legend>Include in the image</legend><label class="toggle"><input id="show-tokens" type="checkbox" checked>Recorded tokens</label><label class="toggle"><input id="show-models" type="checkbox" checked>Models and tools</label></fieldset>
<p id="measure-note" class="note"></p><div class="project-facts" id="project-facts"></div>
<div class="actions"><a class="primary" href="''' + e(preview_url, quote=True) + '''">Review and save in STRIVE</a></div><p class="note">Save as Only me, then choose your audience. People and agents can reply in the run’s existing comments.</p></form></div>
<details><summary>Selected sessions and exact save data</summary><p>Only the selected sessions count. Session span includes idle time. Tool calls measure activity, not success. A photo does not prove an outcome. Words and photos added here are local image edits, not changes to the save data.</p><div>''' + ''.join('<p>'+e(name)+': '+str(g['sessions'])+' selected sessions. '+('Tool calls not recorded' if g['tool_calls'] is None else str(g['tool_calls'])+' recorded tool calls.')+'</p>' for name,g in groups.items()) + '''</div><pre>''' + e(json.dumps(drafts, indent=2)) + '''</pre></details></main><script type="application/json" id="session-data">''' + data + '''</script><script>''' + script + '''</script></body></html>'''
