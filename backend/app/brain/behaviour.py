"""Elaya's shared behaviour policy — the Python twin of src/lib/constants/elaya-behaviour.ts.

Both brains read the SAME file (elaya_behaviour.json, beside this module) and build the block
with the same join, so the shared cached prefix is byte-identical on both. The policy is how
she notices, chooses and speaks (docs/architecture/elaya-behaviour-contract.md); facts,
permissions and action rules stay in the persona and the tools.
"""

from __future__ import annotations

import json
from pathlib import Path

_POLICY: dict = json.loads((Path(__file__).parent / "elaya_behaviour.json").read_text(encoding="utf-8"))

BEHAVIOUR_VERSION: str = str(_POLICY["version"])
# The persona builder's own version (persona.py + persona.ts): bump when the block structure changes.
PROMPT_VERSION = "persona-v3"
RESOLUTION_ORDER: str = str(_POLICY["resolution_order"])
FORBIDDEN_PHRASES: tuple[str, ...] = tuple(_POLICY.get("forbidden_phrases") or ())


def build_behaviour_block() -> str:
    """Identity, then the core as a bullet list (the exact join of buildBehaviourBlock in TS)."""
    core = "\n".join(f"- {line}" for line in _POLICY["core"])
    return f"{_POLICY['identity']}\n\nHow you answer:\n{core}"


def audience(name: str) -> str:
    return str(_POLICY["audiences"].get(name, ""))
