"""THE READER'S HARNESS LIST AND THE SENTENCES A PERSON READS CANNOT DISAGREE.

Codex was added to the reader on 3 Sep 2026. Two shipped strings still said "Claude vs Cursor"
that evening: the `a2a_flex` MCP tool description (mcp_server.py) and the flex line an agent
reads in A2A onboarding (a2a.py). A third, `list_sessions`, said "Claude Code + Cursor" while its
own body already listed three. Nothing failed, because nothing bound the strings to the reader.

`ingest.HARNESSES` is that binding. Add a harness there and every assertion below goes red until
the sentences a stranger and an agent read name it too.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agentgrinder import a2a, ingest, mcp_server

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = tuple(ingest.HARNESSES.values())


def _tool(name):
    return next(t for t in mcp_server.TOOLS if t["name"] == name)


def test_the_registry_is_the_reader_and_the_reader_has_a_parser_for_each():
    for key in ingest.HARNESSES:
        fn = "parse_session" if key == "claude" else f"parse_{key}_session"
        assert callable(getattr(ingest, fn)), fn


def test_every_harness_the_reader_supports_is_named_in_the_agent_facing_tool_descriptions():
    for tool in ("a2a_flex", "list_sessions"):
        text = _tool(tool)["description"]
        for name in NAMES:
            assert name in text, f"{tool} does not name {name}: {text}"


def test_every_harness_is_named_in_the_onboarding_line_an_agent_reads_about_flex():
    line = [l for l in a2a.ONBOARDING.splitlines() if "a2a_flex" in l]
    assert line, "onboarding no longer explains a2a_flex"
    for name in NAMES:
        assert name in line[0], f"onboarding flex line does not name {name}: {line[0]}"


def test_the_a2a_ingest_map_has_one_entry_per_harness():
    assert set(a2a.INGEST) == set(ingest.HARNESSES)


def test_every_mcp_harness_argument_offers_every_harness():
    for tool in mcp_server.TOOLS:
        enum = ((tool["inputSchema"].get("properties") or {}).get("harness") or {}).get("enum")
        if enum is not None:
            assert set(enum) == set(ingest.HARNESSES), tool["name"]


def test_cli_harness_choices_match_each_commands_capture_capability(monkeypatch):
    import argparse
    from agentgrinder import cli

    captured = []
    class ParserReady(Exception):
        pass
    def inspect_parser(parser, argv=None):
        captured.append(parser)
        raise ParserReady
    monkeypatch.setattr(argparse.ArgumentParser, "parse_args", inspect_parser)
    try:
        cli.main([])
    except ParserReady:
        pass
    assert len(captured) == 1
    sub = next(a for a in captured[0]._actions if isinstance(a, argparse._SubParsersAction))
    a2a_sub = next(a for a in sub.choices["a2a"]._actions if isinstance(a, argparse._SubParsersAction))
    parsers = {name: sub.choices[name] for name in ("grind", "share", "vibe", "v1card", "sessions")}
    parsers["a2a export"] = a2a_sub.choices["export"]
    for command, parser in parsers.items():
        flag = next(a for a in parser._actions if "--harness" in a.option_strings)
        expected = {"claude", "cursor", "codex"} if command == "sessions" else set(ingest.HARNESSES)
        assert set(flag.choices) - {"auto"} == expected, command
    # The picker has an explicit all-local-stores choice; Grok reads an explicit export instead.
    assert any("--all" in a.option_strings for a in sub.choices["sessions"]._actions)
