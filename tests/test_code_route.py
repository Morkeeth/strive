"""Code Route: multi-project journey card, privacy bounds, and cross-harness honesty."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from agentgrinder.agent_api import RUN_FIELDS, run_payload
from agentgrinder.code_route import (
    compact_from_checkpoints,
    from_manifest,
    public_code_route,
    validate_code_route,
)
from agentgrinder.push import export_run

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures"
MULTI = FIXTURES / "code_route_multi_project_manifest.json"
MISS = FIXTURES / "code_route_collector_miss_manifest.json"


def multi_route():
    return from_manifest(json.loads(MULTI.read_text()))


def render_card(run: dict) -> str:
    script = r"""
const fs=require('fs'),vm=require('vm');
const root=process.argv[1];
const {ctx:context}=require(root+'/tests/site-card-context.cjs')(root);
const run=JSON.parse(process.argv[2]);
process.stdout.write(vm.runInContext('runCard('+JSON.stringify(run)+',false,0)',context));
"""
    result = subprocess.run(
        ["node", "-e", script, str(ROOT), json.dumps(run)],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def test_multi_project_manifest_builds_three_lanes_and_ordered_stops():
    route = multi_route()
    assert len(route["projects"]) >= 3
    assert [p["label"] for p in route["projects"]] == [
        "zup",
        "agentgrinder-public",
        "mountain-of-helicon",
    ]
    assert [s["id"] for s in route["stops"]] == [
        "zup-edit",
        "zup-commit",
        "strive-edit",
        "strive-check",
        "strive-merge",
        "helicon-edit",
        "helicon-artifact",
    ]
    assert route["harnesses"]["observed"] == ["cursor", "claude-cli", "codex"]
    assert route["harnesses"]["absent"] == ["grok-bot"]
    assert route["harnesses"]["basis"] == "manifest"


def test_fixture_card_renders_lanes_checkpoints_and_basis_in_accessible_text():
    run = {
        "id": "r-code-route",
        "profile_id": "p1",
        "created_at": "2026-09-20T12:00:00Z",
        "title": "Multi-project night",
        "started_at": "2026-09-20T10:00:00Z",
        "project": "agentgrinder-public",
        "harness": "Cursor + Claude CLI + Codex",
        "commits": 1,
        "files_touched": 10,
        "code_route": multi_route(),
        "hero_visual": "change_atlas",
    }
    html = render_card(run)
    assert "code-route" in html
    assert "Trace unavailable" not in html
    text = html
    for name in ("zup", "agentgrinder-public", "mountain-of-helicon"):
        assert name in text
    assert "code-route-project-name" in text
    assert "…" not in text  # phone layout must not ellipsize lane names
    assert "measured" in text and "declared" in text
    assert "densest stretch" in text
    assert "handoffs carried the work" in text
    assert "code-route-insight" in text
    # Usage disclosure may name tokens, but this fixture supplies no token measurement.
    assert "Unknown — not recorded" in text
    assert "Recorded tokens" in text
    assert "cursor" in text and "claude-cli" in text and "codex" in text
    assert "grok-bot" in text
    assert "observed" in text.lower() and "absent" in text.lower()
    assert "aria-label" in text
    # Detail stays in the HTML for agents even when Explore is collapsed for humans.
    assert 'data-run-detail="1"' in html
    assert 'id="run-detail-r-code-route"' in html
    assert "code-route-stops" in html
    assert html.index("Receipts and measurements") < html.index("code-route-stops")
    assert "Receipts" in html


def test_hero_stats_prefer_this_run_over_route_aggregates():
    script = r"""
const GrinderContract=require(process.argv[1]);
const route=JSON.parse(process.argv[2]);
const prefer=GrinderContract.heroStats({
  code_route:route,commits:4,files_touched:41,tool_calls:0,ridge:[2,3,5]
});
const gap=GrinderContract.heroStats({code_route:route});
process.stdout.write(JSON.stringify({prefer,gap}));
"""
    out = subprocess.run(
        ["node", "-e", script, str(ROOT / "site" / "run-contract.js"), json.dumps(multi_route())],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    data = json.loads(out)
    assert data["prefer"] == [["Commits", "4"], ["Projects", "3"], ["Files touched", "41"]]
    # Without a run row, use recorded route facts, not an invented stop total.
    assert data["gap"][0] == ["Projects", "3"]
    assert ["Commits", "1"] in data["gap"]
    assert ["Files changed", "10"] in data["gap"]
    assert not any(label=="Measured stops" for label, _ in data["gap"])


def test_work_route_shapes_day_fix_and_agent():
    script = r"""
const GrinderContract=require(process.argv[1]);
const day=JSON.parse(process.argv[2]);
const compact=JSON.parse(process.argv[3]);
const dayHtml=GrinderContract.codeRoute({code_route:day,harness:'Cursor'});
const fixHtml=GrinderContract.codeRoute({code_route:compact,harness:'Cursor'});
const agentHtml=GrinderContract.codeRoute({code_route:compact,harness:'Grok Bot'});
const cover=GrinderContract.coverHtml({image_url:'https://example.com/out.png'});
const noCover=GrinderContract.coverHtml({output_url:'https://github.com/x/y/pull/1'});
const gallery=GrinderContract.coverHtml({
  image_url:'https://example.com/scene.jpg',
  output_url:'https://example.com/result.png',
});
const event=GrinderContract.eventChip({
  receipts:[{label:'Event: Meetup',url:'https://example.com/meetup'}],
});
process.stdout.write(JSON.stringify({
  dayShape:GrinderContract.routeShape(day,{harness:'Cursor'}),
  fixShape:GrinderContract.routeShape(compact,{harness:'Cursor'}),
  agentShape:GrinderContract.routeShape(compact,{harness:'Grok Bot'}),
  dayHasMap:dayHtml.includes('code-route-map'),
  fixHasMap:fixHtml.includes('code-route-map')&&fixHtml.includes('Code Route'),
  agentHasPath:agentHtml.includes('data-shape="agent"')&&agentHtml.includes('Action'),
  cover:cover.includes('run-cover')&&cover.includes('referrerpolicy="no-referrer"'),
  noCover:!noCover,
  gallery:gallery.includes('run-cover-gallery')&&gallery.includes('Scene')&&gallery.includes('Output'),
  event:event.includes('Meetup')&&event.includes('href="https://example.com/meetup"')&&!/partnership|Grokbot Builders Sunday|luma\.com/i.test(event),
}));
"""
    compact = compact_from_checkpoints(
        project_label="agentgrinder-public",
        commits=2,
        files_changed=4,
        receipts=1,
        artifact=True,
    )
    out = subprocess.run(
        [
            "node",
            "-e",
            script,
            str(ROOT / "site" / "run-contract.js"),
            json.dumps(multi_route()),
            json.dumps(compact),
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    data = json.loads(out)
    assert data["dayShape"] == "day" and data["dayHasMap"]
    assert data["fixShape"] == "day" and data["fixHasMap"]
    assert data["agentShape"] == "agent" and data["agentHasPath"]
    assert data["cover"] and data["noCover"]
    assert data["gallery"] and data["event"]


def test_declared_only_compact_stays_a_work_path():
    """A lonely declared stop is a quick path, not a Code Route map."""
    script = r"""
const GrinderContract=require(process.argv[1]);
const route=JSON.parse(process.argv[2]);
const html=GrinderContract.codeRoute({code_route:route,harness:'Cursor'});
process.stdout.write(JSON.stringify({
  shape:GrinderContract.routeShape(route,{harness:'Cursor'}),
  workPath:html.includes('work-path'),
  map:html.includes('code-route-map'),
}));
"""
    declared = compact_from_checkpoints(
        project_label="agentgrinder-public",
        receipts=2,
    )
    out = subprocess.run(
        ["node", "-e", script, str(ROOT / "site" / "run-contract.js"), json.dumps(declared)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    data = json.loads(out)
    assert data["shape"] == "fix"
    assert data["workPath"] is True
    assert data["map"] is False


def test_route_insight_uses_handoffs_concentration_and_finish_not_tokens():
    script = r"""
const GrinderContract=require(process.argv[1]);
const route=JSON.parse(process.argv[2]);
process.stdout.write(GrinderContract.routeInsight(route));
"""
    fixture_insight = subprocess.run(
        ["node", "-e", script, str(ROOT / "site" / "run-contract.js"), json.dumps(multi_route())],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert fixture_insight == (
        "agentgrinder-public held the densest stretch (3 of 7 stops). "
        "2 handoffs carried the work to mountain-of-helicon. "
        "6 measured, 1 declared."
    )
    night_route = {
        "v": 1,
        "projects": [
            {"id": "zup", "label": "zup", "basis": "measured"},
            {"id": "agentgrinder-public", "label": "agentgrinder-public", "basis": "measured"},
            {"id": "mountain-of-helicon", "label": "mountain-of-helicon", "basis": "measured"},
            {"id": "fleet-ops", "label": "fleet-ops", "basis": "measured"},
        ],
        "stops": [
            {"id": "zup-probe", "project": "zup", "kind": "check", "label": "a", "basis": "measured"},
            {"id": "zup-merge", "project": "zup", "kind": "merge", "label": "b", "basis": "measured"},
            {"id": "strive-upload", "project": "agentgrinder-public", "kind": "artifact", "label": "c", "basis": "measured"},
            {"id": "strive-route", "project": "agentgrinder-public", "kind": "merge", "label": "d", "basis": "measured"},
            {"id": "strive-live", "project": "agentgrinder-public", "kind": "deploy", "label": "e", "basis": "measured"},
            {"id": "helicon-build", "project": "mountain-of-helicon", "kind": "artifact", "label": "f", "basis": "measured"},
            {"id": "helicon-merge", "project": "mountain-of-helicon", "kind": "merge", "label": "g", "basis": "measured"},
            {"id": "fleet-fail", "project": "fleet-ops", "kind": "check", "label": "h", "basis": "measured"},
            {"id": "fleet-merge", "project": "fleet-ops", "kind": "merge", "label": "i", "basis": "measured"},
        ],
        "connectors": [
            {"from": "zup-merge", "to": "strive-upload", "kind": "handoff"},
            {"from": "strive-live", "to": "helicon-build", "kind": "handoff"},
            {"from": "helicon-merge", "to": "fleet-fail", "kind": "handoff"},
        ],
        "finish": {"stop": "fleet-merge", "kind": "artifact", "label": "Four verified lanes reconciled"},
    }
    night_insight = subprocess.run(
        ["node", "-e", script, str(ROOT / "site" / "run-contract.js"), json.dumps(night_route)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert night_insight == (
        "agentgrinder-public held the densest stretch (3 of 9 stops). "
        "3 handoffs carried the work to fleet-ops. "
        "Every stop is measured."
    )
    assert "token" not in night_insight.lower()
    assert "tool call" not in night_insight.lower()


def test_single_project_compact_route_or_honest_unavailable():
    ok = compact_from_checkpoints(
        project_label="agentgrinder-public",
        commits=4,
        files_changed=10,
        receipts=3,
        artifact=True,
    )
    assert ok["projects"][0]["label"] == "agentgrinder-public"
    assert any(s["kind"] == "edit" for s in ok["stops"])
    assert any(s["kind"] == "commit" for s in ok["stops"])
    assert ok["finish"]["kind"] == "artifact"
    missing = compact_from_checkpoints(project_label="agentgrinder-public")
    assert "unavailable" in missing
    assert "No checkpoint evidence" in missing["unavailable"]["why"]


def test_attach_measured_code_route_from_cursor_counts():
    from agentgrinder.code_route import attach_measured_code_route

    run = attach_measured_code_route(
        {
            "harness": "Cursor",
            "project": "agentgrinder-public",
            "commits": 2,
            "files_touched": 13,
            "tool_calls": 149,
        }
    )
    route = run["code_route"]
    assert route["projects"][0]["label"] == "agentgrinder-public"
    assert [s["kind"] for s in route["stops"]] == ["edit", "commit"]
    assert route["stats"]["files_changed"] == 13
    assert route["stats"]["commits"] == 2
    assert route["harnesses"]["observed"] == ["cursor"]
    # Does not invent output links.
    assert "output_url" not in run
    # Leaves an explicit route alone.
    kept = {"v": 1, "unavailable": {"why": "Collector missed Cursor."}}
    again = attach_measured_code_route({"code_route": kept, "commits": 9})
    assert again["code_route"]["unavailable"]["why"] == "Collector missed Cursor."
    # No project, no fabricated route.
    bare = attach_measured_code_route({"commits": 2, "files_touched": 3})
    assert "code_route" not in bare


def test_attach_skips_unproven_project():
    """project_proven False must never fabricate a route from counts (ws2 PR69 guard)."""
    from agentgrinder.code_route import attach_measured_code_route

    run = attach_measured_code_route(
        {
            "harness": "Cursor",
            "project": "agentgrinder-public",
            "project_proven": False,
            "commits": 2,
            "files_touched": 13,
        }
    )
    assert "code_route" not in run


def test_attach_skips_unavailable_compact_route():
    """Zero checkpoint evidence must leave the run unchanged, not attach unavailable."""
    from agentgrinder.code_route import attach_measured_code_route

    run = {
        "harness": "Cursor",
        "project": "agentgrinder-public",
        "commits": 0,
        "files_touched": 0,
    }
    out = attach_measured_code_route(run)
    assert out is run
    assert "code_route" not in out


def test_attach_never_promotes_artifacts_produced_to_finish():
    """artifacts_produced is tool-write count, never a shipped artifact finish stop."""
    from agentgrinder.code_route import attach_measured_code_route

    only_artifacts = attach_measured_code_route(
        {
            "harness": "Cursor",
            "project": "agentgrinder-public",
            "artifacts_produced": 13,
        }
    )
    assert "code_route" not in only_artifacts

    with_counts = attach_measured_code_route(
        {
            "harness": "Cursor",
            "project": "agentgrinder-public",
            "commits": 2,
            "files_touched": 13,
            "artifacts_produced": 13,
        }
    )
    route = with_counts["code_route"]
    assert route["finish"]["kind"] != "artifact"
    assert not any(s["kind"] == "artifact" for s in route["stops"])
    assert route["stats"]["shipped_artifacts"] == 0


def test_collector_miss_names_absent_harness_populations():
    route = from_manifest(json.loads(MISS.read_text()))
    assert "unavailable" in route
    assert route["harnesses"]["observed"] == []
    assert set(route["harnesses"]["absent"]) >= {"cursor", "claude-cli", "codex"}
    assert route["harnesses"]["basis"] == "collector"


def test_code_route_survives_export_and_run_payload():
    run = {"turns_typed": 2, "schema_version": 1, "code_route": multi_route()}
    assert "code_route" in RUN_FIELDS
    for prepared in (export_run(run), run_payload(run)):
        assert prepared["code_route"] == multi_route()


def test_privacy_rejects_paths_prompts_secrets_unknown_keys_and_oversize():
    base = multi_route()
    with pytest.raises(ValueError, match="path"):
        validate_code_route(
            {
                **base,
                "projects": [
                    {"id": "zup", "label": "/Users/me/CODE/secret", "basis": "measured"},
                    base["projects"][1],
                    base["projects"][2],
                ],
            }
        )
    bad_stops = [dict(stop) for stop in base["stops"]]
    bad_stops[0] = {
        **bad_stops[0],
        "evidence": ["~/.claude/projects/x"],
    }
    with pytest.raises(ValueError, match="path|home"):
        validate_code_route({**base, "stops": bad_stops})
    bad_label = [dict(stop) for stop in base["stops"]]
    bad_label[0] = {**bad_label[0], "label": "api_key leaked"}
    with pytest.raises(ValueError, match="secret|prompt|private lane"):
        validate_code_route({**base, "stops": bad_label})
    with pytest.raises(ValueError, match="Unknown"):
        validate_code_route({**base, "prompt": "PRIVATE"})
    with pytest.raises(ValueError, match="at most|holds"):
        validate_code_route(
            {
                **base,
                "stops": base["stops"]
                + [
                    {
                        "id": f"extra-{i}",
                        "project": "zup",
                        "kind": "edit",
                        "label": f"extra {i}",
                        "basis": "measured",
                    }
                    for i in range(40)
                ],
            }
        )


def test_redaction_rejects_private_lane_labels():
    with pytest.raises(ValueError):
        validate_code_route(
            {
                "v": 1,
                "projects": [{"id": "p1", "label": "L12 PRIVATE LANE", "basis": "measured"}],
                "stops": [
                    {
                        "id": "s1",
                        "project": "p1",
                        "kind": "edit",
                        "label": "work",
                        "basis": "measured",
                    }
                ],
                "finish": {"stop": "s1", "kind": "unfinished", "label": "work"},
                "stats": {
                    "projects_touched": 1,
                    "commits": 0,
                    "files_changed": 0,
                    "verified_checkpoints": 1,
                    "shipped_artifacts": 0,
                },
            }
        )
    # Public repo names may travel when explicitly included; private lane tokens may not.
    public = public_code_route({"code_route": multi_route()})
    text = json.dumps(public)
    assert "L12" not in text and "PRIVATE" not in text
    assert "agentgrinder-public" in text


def test_legacy_rhythm_and_ridge_cards_still_render():
    rhythm = render_card(
        {
            "id": "r1",
            "profile_id": "p1",
            "created_at": "2026-09-20T12:00:00Z",
            "title": "Legacy rhythm",
            "started_at": "2026-09-20T10:00:00Z",
            "rhythm": [1, 2, 1, 3],
            "trace_basis": "elapsed",
        }
    )
    assert "Legacy rhythm" in rhythm
    assert "Activity timing was not captured." in rhythm
    assert "Tool calls / min" not in rhythm  # Unknown old basis cannot acquire a clock.
    ridge = [i % 5 for i in range(50)]
    workers = [0] * 50
    shaped = render_card(
        {
            "id": "r2",
            "profile_id": "p1",
            "created_at": "2026-09-20T12:00:00Z",
            "title": "Legacy ridge",
            "started_at": "2026-09-20T10:00:00Z",
            "ridge": ridge,
            "worker_bins": workers,
            "ridge_basis": "wall-time",
            "ridge_wall_seconds": 600,
        }
    )
    assert "post-trail" in shaped
    assert "Tool calls / min" in shaped
    assert shaped.count('class="activity-bar"') == 40
    assert "12 seconds each" in shaped
    assert "idle gaps compressed" in shaped
