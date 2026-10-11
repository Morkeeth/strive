r"""Claim detection and conservative same-turn test-evidence matching.

The claim detector was calibrated on 396 labelled assistant lines on 3 September 2026.
Its held-out corpus-wide precision is 0.63 and recall 0.66; see the dated calibration
report and per-harness limitations. Those figures measure detection of claim lines,
NOT whether the matched evidence proves a claim.
The prior v0 detector measured 0.32 precision and 0.37 recall on that held-out set.

Evidence rule `test-outcomes-2026-09-04` rejects failure output before considering a
positive result. Named tests require exact token boundaries and matching positive
output. A generic passing summary can support only an unnamed test/suite claim.
Compound claims about deployment, file creation or another operation remain unknown.
A filename appearing in output does not establish that the file changed.

The evidence rule's field precision and recall remain unmeasured. Same-turn matching
still does not establish independent verification, command identity or causal impact.
Artifact existence and git outcomes have separate coach tools. Historical branch-share
measurements describe the older rule and must not be presented as current measurements.

A claim is a line asserting accomplished work; plans, instructions, headings and quoted
output are excluded. Evidence may precede the claim within its human turn, because agents
usually run a check before reporting its result. Evidence from another turn does not count.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


DECOR = re.compile(r"[*`~]+")
# underscores only outside a word: test_never_ran is a name, not emphasis
UNDER = re.compile(r"(?<!\w)_+|_+(?!\w)")
BULLET = re.compile(r"^\s*(?:[-*+•]\s+|\d+[.)]\s+|\(\w\)\s+)+")

NOT_PROSE = re.compile(r"""^(?:
      \#{1,6}\s | \| | > | ``` | -{3,}$ | [\[\{]"? | \$\s | https?:// | /\w+
    | \w+\s*=\s*\S
)""", re.X)

V = (r"fixed|added|created|wrote|written|built|shipped|deployed|pushed|committed|merged|"
     r"landed|removed|deleted|renamed|replaced|updated|ran|re-?ran|rebuilt|reseeded|closed|"
     r"corrected|refreshed|relayed|stashed|replayed|secured|generated|staged|verified|"
     r"confirmed|checked|implemented|switched|flipped|wired|restored|archived|published|"
     r"released|resolved|repaired|cleaned|reloaded|regenerated|caught|killed|stamped|filed|"
     r"drafted|documented|captured|patched|swapped|reverted|told|sent|handed|routed|found|"
     r"hoisted|split|proven|reached")
VERB = r"(?<![-\w])(?:" + V + r")(?![-\w])"

OUT = (r"passes|passed|green|clean|failed|works(?! by| via| through)|worked|"
       r"succeeded|exit(?:ed| code)? 0|no errors")
OUTCOME = re.compile(r"(?<![-\w])(?:" + OUT + r")(?![-\w])", re.I)
OUTCOME_LOOSE = re.compile(r"(?<![-\w])(?:" + OUT + r"|pass|passing)(?![-\w])", re.I)
STATUS_TOKEN = re.compile(r"\b(PASS|PASSED|FAIL|FAILED|FAILURE|OK|GREEN|DONE|SHIPPED)\b")
CHECK_SUBJ = re.compile(r"\btest_\w+|\b(test|tests|suite|lint|build|ci|typecheck|tsc|verify|validator|check|"
                        r"checks|gate|gates|probe|run|deploy|npm|pytest|make|compile|branch|"
                        r"assertion|assertions|login|endpoint|api|script|cli|command|demo|"
                        r"install|clone|path|repo|node|python|docker|server)\b|\d", re.I)

SPEC = re.compile(r"\bdone\s*[-\s]?when\b|\bwhen:", re.I)
INTENT_HARD = re.compile(
    r"\b(i'll|we'll|i will|we will|going to|about to|let me|let's|next up|plan to|"
    r"need|needs|needed|todo|to-do|start by|begin by)\b", re.I)
INTENT = re.compile(
    r"\b(shall|should|would|could|must|i'd|we'd|maybe|perhaps|propose|proposed|"
    r"recommend|suggest|worth)\b", re.I)
COND_HEAD = re.compile(r"^(if|unless|until|once|when|whether|rather than|instead of|after|before|during|each time|every time)\b", re.I)
COND_MID = re.compile(r"\b(if|unless|until|whether)\b", re.I)
IMPERATIVE_HEAD = re.compile(
    r"^(use|add|keep|write|make|check|run|store|give|ship|stop|do|prove|test|read|fold|"
    r"contact|send|build|treat|cut|push|pick|choose|call|say|tell|ask|note|see|open|close|"
    r"consider|avoid|remember|measure|report|update|create|delete|remove|replace|hold|wait|"
    r"schedule|draft|post|publish|merge|deploy|verify|confirm|label|mark|set|put|move|"
    r"inspect|ensure|prefer|reject|allow|maximum|minimum)\b\s", re.I)
PROGRESSIVE = re.compile(
    r"^(?:i'm|we're|now|then)?\s*(?:currently\s+)?"
    r"(running|building|writing|checking|saving|updating|reading|tracing|drafting|"
    r"finishing|working|moving|adding|preparing|generating|reviewing|ensuring|"
    r"verifying|probing|scanning|switching|continuing|holding|waiting|looking|starting)\b", re.I)
INTERJECTION = re.compile(
    r"^(glad|happy|nice|great|good|thanks|thank you|sorry|yes|no|right|correct|agreed|"
    r"exactly|indeed|ok|okay|perfect|understood)\b", re.I)
CANT = re.compile(r"\b(cannot|can't|could not|couldn't|did not|didn't|does not|doesn't|"
                  r"won't|will not|unable to)\s+(?:\w+\s+){0,2}\w*$", re.I)
NOT_AGENT_SUBJ = re.compile(r"^(he|she|they|someone|somebody|nobody|no one|everyone|"
                            r"people|you|your|his|her|their|the author|the user)\b", re.I)
ADJECTIVAL = re.compile(r"\b(a|an|the|any|every|each|one|no|this|that|these|those)\s+$", re.I)

P1 = re.compile(r"\b(?:i|we)(?:'ve| have| had)?\b[^.;]{0,80}?\b" + VERB, re.I)
P2 = re.compile(r"^" + VERB, re.I)
P2b = re.compile(r"^[\w./-]{1,40}\s*[:\-–—]+\s*(?:" + VERB + r"|done|complete|green|clean|live|"
                 r"passed|passes|pass|failed|ok)(?![-\w])", re.I)
SUBJ_HEAD = (r"^(?:the |a |an |every |all |both |two |three |four |five |\d+ )?"
             r"[\w`'./-]+[,;:]?(?:\s+[\w`'.,/-]+){0,5}\s+")
P2c = re.compile(SUBJ_HEAD + VERB, re.I)
P2d = re.compile(SUBJ_HEAD + r"(?:" + OUT + r")(?![-\w])", re.I)
STATE_DONE = re.compile(
    r"\b(?:is|are|was|were|now)\s+(?:\w+[-\w]*\s+){0,2}"
    r"(?:done|complete|completed|fixed|shipped|deployed|merged|pushed|landed|green|clean|"
    r"closed|public|verified|committed|written|built|added|gone)(?![-\w])", re.I)
STATE_DONE2 = re.compile(r"\b(?:done|shipped|deployed|landed|closed|complete)(?![-\w])\s*[.!]", re.I)

SENT = re.compile(r"(?<=[.;!])\s+")


def _sentences(line: str):
    s = line.strip().replace("’", "'").replace("‘", "'")
    s = BULLET.sub("", s)
    s = UNDER.sub("", DECOR.sub("", s)).strip()
    return [x.strip() for x in SENT.split(s) if x.strip()]


def _accept(sent: str):
    """Position of the accepting match in one sentence, or None."""
    for rx in (P1, P2, P2b, P2c, P2d, STATE_DONE, STATE_DONE2):
        m = rx.search(sent)
        if m:
            head = sent[:m.end()]
            if CANT.search(head):          # "cannot be generated" is not work done
                continue
            # an adjectival use ("the verified claim", "a deployed app") asserts nothing
            vm = list(re.finditer(VERB, sent[m.start():m.end()], re.I))
            if vm and ADJECTIVAL.search(sent[m.start():m.start() + vm[-1].start()]):
                continue
            return m.start()
    mo = OUTCOME_LOOSE.search(sent) or STATUS_TOKEN.search(sent)
    if mo:
        for ms in CHECK_SUBJ.finditer(sent):
            # the checked thing is named BEFORE its outcome; a bare number must be adjacent
            gap = mo.start() - ms.end()
            if 0 <= gap <= (6 if ms.group(0).isdigit() else 25):
                return mo.start()
    return None


def _sentence_is_claim(sent: str) -> bool:
    if not sent or sent.endswith("?"):
        return False
    if SPEC.search(sent) or COND_HEAD.search(sent) or COND_MID.search(sent):
        return False
    if IMPERATIVE_HEAD.search(sent) or PROGRESSIVE.search(sent) or INTERJECTION.search(sent):
        return False
    if NOT_AGENT_SUBJ.search(sent) or INTENT_HARD.search(sent):
        return False
    pos = _accept(sent)
    if pos is None:
        return False
    m = INTENT.search(sent)
    if m and m.start() < pos:          # the intent governs the verb
        return False
    return True


def is_claim_line(line: str) -> bool:
    raw = line.strip()
    if not raw or NOT_PROSE.search(raw):
        return False
    flat = UNDER.sub("", DECOR.sub("", BULLET.sub("", raw.replace("’", "'")))).strip()
    if flat.endswith(":") and "." not in flat[:-1]:
        return False                    # a label that introduces a list
    return any(_sentence_is_claim(s) for s in _sentences(raw))


RULE_PARTS = (NOT_PROSE, VERB, OUT, OUTCOME, OUTCOME_LOOSE, STATUS_TOKEN, CHECK_SUBJ, SPEC,
              INTENT_HARD, INTENT, COND_HEAD, COND_MID, IMPERATIVE_HEAD, PROGRESSIVE,
              INTERJECTION, CANT, NOT_AGENT_SUBJ, ADJECTIVAL, P1, P2, P2b, P2c, P2d,
              STATE_DONE, STATE_DONE2, DECOR, UNDER, BULLET, SENT)


def rule_fingerprint() -> str:
    """A digest of the claim rule: every pattern AND the code that applies them.

    The patterns alone are not the rule. The order they are tried in, the distance a check subject
    may sit from its outcome, the colon-label refusal and the sentence split all decide what counts
    as a claim, so the source of the four functions that hold them is digested too.

    The published precision and recall belong to THIS rule text. The digest is stored beside
    those numbers in docs/claim-calibration.json, and a test fails when the rule changes and the
    calibration does not: a measured claim about an instrument stops being true the moment the
    instrument is edited.
    """
    import hashlib
    import inspect
    blob = "\n".join(p if isinstance(p, str) else p.pattern for p in RULE_PARTS)
    blob += "\n".join(inspect.getsource(f) for f in
                      (_sentences, _accept, _sentence_is_claim, is_claim_line))
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


# ---- the evidence side (unchanged, and still unmeasured: see the docstring) ----
_TEST_NAME = re.compile(r"\btest_\w+")
_PATH = re.compile(r"[\w.\-]+(?:/[\w.\-]+)+\.\w{1,6}|\b[\w\-]+\.(?:py|ts|js|tsx|jsx|md|json|html|toml|sh|yml|yaml)\b")
_GENERIC_OK = re.compile(r"\b\d+ passed\b|^OK\b|\bexit(?: code)? 0\b", re.M)
_GENERIC_BAD = re.compile(r"\b\d+ failed\b|\bFAILED\b|\bTraceback\b")


@dataclass
class Claim:
    line: str
    tokens: set = field(default_factory=set)   # test names + paths named in the claim line
    verified: bool = False


def claims_in(text: str) -> list[Claim]:
    """Every line of assistant text that reads as a claim. Never persisted; counts only leave."""
    out = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or not is_claim_line(line):
            continue
        toks = set(_TEST_NAME.findall(line)) | set(_PATH.findall(line))
        out.append(Claim(line=line, tokens=toks))
    return out


EVIDENCE_VERSION = "test-outcomes-2026-09-04-v2"
_TEST_SUBJECT = re.compile(r"\b(?:tests?|suite|pytest|test_\w+)\b", re.I)
_OTHER_OUTCOME = re.compile(r"\b(?:deploy\w*|merg\w*|commit\w*|shipp?\w*|creat\w*|wrote|written|added|remov\w*|renam\w*|updated|built|landed)\b", re.I)
_PASS_RESULT = re.compile(r"\b(?:PASSED|PASS|passed|ok)\b")
_FAIL_RESULT = re.compile(r"\b(?:FAILED|FAIL|Traceback|Error|Exception)\b|\b[1-9]\d* (?:failed|errors?)\b", re.I)


def evidence_kind(claim: Claim, result_text: str) -> str | None:
    """Classify conservative test evidence, never infer a file/deploy outcome from a string.

    Named tests require exact token boundaries and a positive outcome. Generic test summaries
    support only unnamed test claims. Compound claims about another operation remain unknown.
    This is a same-turn text matcher, not independent verification or a measured accuracy score.
    """
    if not result_text or _FAIL_RESULT.search(result_text):
        return None
    if not _TEST_SUBJECT.search(claim.line) or _OTHER_OUTCOME.search(claim.line):
        return None
    if not (_GENERIC_OK.search(result_text) or _PASS_RESULT.search(result_text)):
        return None
    tests = set(re.findall(r"(?<![\w/])test_\w+\b(?!\.\w)", claim.line))
    targets = tests or {token for token in claim.tokens if "." in token or "/" in token}
    if targets:
        for target in targets:
            token = re.compile(r"(?<![\w./-])" + re.escape(target) + r"(?![\w./-])")
            matching_lines = [line for line in result_text.splitlines() if token.search(line)]
            if not any((_PASS_RESULT.search(line) or _GENERIC_OK.search(line))
                       and not re.search(r"\b(?:SKIPPED|SKIP|XFAIL|PENDING)\b",line,re.I)
                       for line in matching_lines):
                return None
        return "token"
    return "generic" if _GENERIC_OK.search(result_text) else None


def evidence_matches(claim: Claim, result_text: str) -> bool:
    return evidence_kind(claim, result_text) is not None


class ClaimTracker:
    """Feed it the trace in order; read `claims` / `verified` at the end.

    A 'turn' is the span after one typed human turn up to the next. Claims and tool results
    collect per turn; when the turn closes (next typed turn or end of file) each claim is checked
    against every result of that turn, before or after it.
    """

    def __init__(self) -> None:
        self.claims = 0
        self.verified = 0
        self._turn_claims: list[Claim] = []
        self._turn_results: list[str] = []

    def typed_turn(self) -> None:
        self._close()

    def assistant_text(self, text: str) -> None:
        self._turn_claims.extend(claims_in(text))

    def tool_result(self, text: str) -> None:
        if text:
            self._turn_results.append(text)

    def close(self) -> None:
        self._close()

    def _close(self) -> None:
        for c in self._turn_claims:
            c.verified = any(evidence_matches(c, r) for r in self._turn_results)
            self.claims += 1
            self.verified += int(c.verified)
        self._turn_claims = []
        self._turn_results = []


def result_text(o: dict) -> str:
    """Flatten one `type: user` tool_result record (or its toolUseResult) to searchable text."""
    parts: list[str] = []
    msg = o.get("message") if isinstance(o.get("message"), dict) else {}
    c = msg.get("content")
    if isinstance(c, list):
        for b in c:
            if isinstance(b, dict) and b.get("type") == "tool_result":
                if b.get("is_error") is True or b.get("isError") is True:
                    parts.append("ERROR: tool reported failure")
                inner = b.get("content")
                if isinstance(inner, str):
                    parts.append(inner)
                elif isinstance(inner, list):
                    parts.extend(x.get("text", "") for x in inner if isinstance(x, dict))
    tr = o.get("toolUseResult")
    if isinstance(tr, dict):
        exit_code=tr.get("exit_code",tr.get("exitCode"))
        if tr.get("interrupted") is True or (exit_code is not None and str(exit_code).lstrip("-").isdigit() and int(exit_code)!=0):
            parts.append("ERROR: tool reported failure")
        for k in ("stdout", "stderr", "output", "listing"):
            v = tr.get(k)
            if isinstance(v, str):
                parts.append(v)
    elif isinstance(tr, str):
        parts.append(tr)
    return "\n".join(p for p in parts if p)


def is_tool_result(o: dict) -> bool:
    msg = o.get("message") if isinstance(o.get("message"), dict) else {}
    c = msg.get("content")
    return o.get("type") == "user" and isinstance(c, list) and any(
        isinstance(b, dict) and b.get("type") == "tool_result" for b in c)
