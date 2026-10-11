"""Explicitly consented Git descriptions and bounded public-source verification."""
import json
import re
import urllib.error
import urllib.request

from .code_route import validate_checkpoint_source, _reject_text


def permissions(projects, subjects=False, files=False, public_repos=()):
    from .route_capture import git
    if not subjects and not files and not public_repos:
        return None
    selected = {p['name']: p for p in projects}
    repositories = {}
    for mapping in public_repos:
        name, separator, url = mapping.partition('=')
        if not separator or name not in selected or name in repositories:
            raise ValueError('--public-repo requires one selected project name and its explicit GitHub URL.')
        _reject_text(url, 'public repository')
        match = re.fullmatch(r'https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)', url)
        if not match or match[1] in ('.', '..') or match[2] in ('.', '..') or url.endswith('.git'):
            raise ValueError('Use the canonical public GitHub repository URL without credentials or suffixes.')
        remote = git(selected[name]['root'], 'remote', 'get-url', 'origin').decode().strip()
        identity = match[1] + '/' + match[2]
        if remote not in (url, url+'.git', 'git@github.com:'+identity, 'git@github.com:'+identity+'.git'):
            raise ValueError('The consented public repository must match the selected project origin exactly.')
        repositories[selected[name]['id']] = url
    return {'commit_subjects': bool(subjects), 'file_names': bool(files), 'public_repos': repositories}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def public_json(path):
    """No auth, cookies, redirects or local proxies; only explicitly selected public GitHub."""
    request = urllib.request.Request('https://api.github.com'+path,
        headers={'Accept':'application/vnd.github+json', 'User-Agent':'STRIVE-source-review'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=5) as response:
        raw = response.read(1024*1024+1)
    if len(raw) > 1024*1024:
        raise ValueError('Public source response exceeded the bounded read limit.')
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError('Public source response was not an object.')
    return value


def verified_urls(repository, hashes):
    if not repository or not hashes:
        return {}
    identity = repository.removeprefix('https://github.com/')
    try:
        repo = public_json('/repos/'+identity)
        if repo.get('private') is not False or repo.get('full_name') != identity or repo.get('html_url') != repository:
            return {}
    except (OSError, ValueError, urllib.error.URLError):
        return {}
    result = {}
    for digest in hashes:
        try:
            commit = public_json('/repos/'+identity+'/git/commits/'+digest)
            url = repository+'/commit/'+digest
            if commit.get('sha') == digest and commit.get('html_url') == url:
                result[digest] = url
        except (OSError, ValueError, urllib.error.URLError):
            continue
    return result


def collect(project, settings, changed, commits):
    from .route_capture import git
    if len(commits) > 5:
        raise ValueError('A landmark checkpoint supports at most 5 newly observed commits; no commits were dropped.')
    value = {'v':1, 'consent':'explicit', 'commits':[{'sha':digest} for digest in commits], 'files_changed':len(changed)}
    if settings['commit_subjects']:
        for item in value['commits']:
            # %s is Git's exact subject representation, never a generated interpretation.
            subject = git(project['root'], 'show', '-s', '--format=%s', item['sha']).decode('utf-8', errors='replace').rstrip('\n')
            candidate = {**value, 'commits':[{**item, 'subject':subject}]}
            try:
                validate_checkpoint_source(candidate)
            except ValueError:
                continue  # A sensitive/oversized description stays local and is omitted.
            item['subject'] = subject
    if settings['file_names']:
        names = []
        for name in changed:
            try:
                validate_checkpoint_source({**value, 'files':[name]})
            except ValueError:
                continue
            names.append(name)
        value['files'] = names[:20]
    urls = verified_urls(settings['public_repos'].get(project['id']), commits)
    for item in value['commits']:
        if item['sha'] in urls:
            item['url'] = urls[item['sha']]
    return validate_checkpoint_source(value)
