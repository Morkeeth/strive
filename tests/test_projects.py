"""A run can belong to a project; a project page shows its runs (25 Sep 2026)."""
from pathlib import Path

INDEX = (Path(__file__).resolve().parents[1] / "site/index.html").read_text()


def test_preview_and_composer_take_a_repository_link():
    assert 'id="i_repo"' in INDEX and 'id="f_repo"' in INDEX
    assert "'i_repo'" in INDEX.split("const editFields=")[1].split("]")[0]
    assert "'f_repo'" in INDEX.split("const fields=['f_title'")[1].split("]")[0]
    assert "const url=safeOutputUrl($('i_repo')?.value)" in INDEX
    assert "url&&/^https:/.test(url)?url:null" in INDEX
    # The saved row: the typed field wins over the capture, and a non-link clears it.
    assert "if(repo) coach.repo_url=repo; else delete coach.repo_url;" in INDEX
    assert "repo_url:safeRepoUrl($('f_repo')?.value)" in INDEX
    # https only, or nothing: a repository link is clicked, never printed as text.
    assert "function safeRepoUrl(value)" in INDEX and "/^https:/.test(url)" in INDEX


def test_project_page_and_list_are_routed_with_explicit_account_scope():
    assert "if(q.has('projects'))return viewProjects();" in INDEX
    assert "if(q.has('project'))return viewProject(q.get('project'));" in INDEX
    page = INDEX[INDEX.index("async function viewProject(name)") : INDEX.index("async function viewProjects()")]
    assert ".eq('project',name).eq('visibility','public')" in page
    assert ".eq('project',name).eq('profile_id',profileId)" in page  # the owner sees their own too
    lst = INDEX[INDEX.index("async function viewProjects()") : INDEX.index("async function viewProfile(handle)")]
    assert "query=mine?query.eq('profile_id',profileId):query.eq('visibility','public')" in lst
    rail = INDEX[INDEX.index("function railHtml"):INDEX.index("function setPrimarySection")]
    assert "Projects" not in rail  # preserved as a deep link, not primary navigation


def test_cards_and_profile_link_to_the_project():
    assert "function projectLinkHtml(r)" in INDEX
    assert "opts.preview?esc(project):projectLinkHtml(r)" in INDEX
    assert "profileProjectsHtml(R,mine)" in INDEX
    assert 'class="profile-project"' in INDEX
