"""THE GRIND COACH: an agent that owns the card's numbers instead of a regex owning them.

A grind card used to be a self-report: `claims.py` counted claims and called them verified by
a rule, `solo.py` counted files that exist and called them produced. The coach turns that into
a refereed result. It reads the run through tools, checks every claim against the evidence in
its own human turn, asks the disk whether every artifact exists, asks git which of them landed,
and only then writes the verdict block and a next-session plan. A number the coach did not get
from a tool cannot be written: `write_verdict` refuses it.

Layout:
  tools.py        the five tools as plain functions on a CoachContext, and `build_coach_tools`
                  which wraps them as Strands `@tool`s. The plain functions import nothing
                  beyond this package, so the base install (Python 3.9, no dependencies) keeps
                  working; Strands is the `[coach]` extra.
  local_model.py  a Strands Model that replays a deterministic policy through the real event
                  loop. Keyless, no network, no spend. Not a language model.
  agent.py        create_coach(), the dispatch-log hook, the three modes, the CLI entry.

Privacy: the coach runs on counts, claim lines and git evidence. It never reads a typed prompt
into a tool result, never returns an absolute path, never returns code. In `bedrock` mode the
claim lines and tool-result snippets leave the machine, and the command prints that before it
runs. The keyless default sends nothing anywhere.
"""
