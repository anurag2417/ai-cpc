"""
Python mirror of the Node input/output safety pipeline for workers or batch jobs.

Requires: pip install openai
Env: OPENAI_API_KEY

Usage:
  from middleware.ai_guardrails import moderate_user_prompt, guardrail_llm_output
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any

# Optional: only load openai when calling API helpers
def _client():
    from openai import OpenAI

    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=key)


EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
US_PHONE = re.compile(
    r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b"
)
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")


def find_pii_matches(text: str) -> list[str]:
    found: list[str] = []
    if EMAIL.search(text):
        found.append("email")
    if US_PHONE.search(text):
        found.append("phone")
    if SSN.search(text):
        found.append("ssn")
    return found


BLOCK_CATEGORIES = {
    "sexual",
    "sexual/minors",
    "hate",
    "hate/threatening",
    "harassment",
    "harassment/threatening",
    "self-harm",
    "self-harm/intent",
    "self-harm/instructions",
    "violence",
    "violence/graphic",
    "illicit",
    "illicit/violent",
}

OUTPUT_BLOCK_CATEGORIES = {
    "sexual",
    "sexual/minors",
    "violence",
    "violence/graphic",
    "self-harm",
    "self-harm/intent",
    "self-harm/instructions",
}

SAFE_FALLBACK = (
    "I can’t share a good answer to that right now. "
    "Please ask a grown-up or try a different question."
)

HALLUCINATION_HINTS = [
    re.compile(r"\b100%\s+(certain|sure|accurate|correct)\b", re.I),
    re.compile(r"\bguaranteed\s+(to|that)\b", re.I),
    re.compile(r"\bI\s+(know|remember)\s+for\s+a\s+fact\b", re.I),
]

AGE_BAD = [
    re.compile(r"\b(fuck|shit|bitch|damn|asshole|crap)\b", re.I),
]


@dataclass
class ModerationResult:
    allowed: bool
    reason: str = ""
    layer: str = ""  # "regex_pii" | "openai_moderation"


def screen_prompt_for_pii(text: str) -> ModerationResult:
    kinds = find_pii_matches(text)
    if not kinds:
        return ModerationResult(True)
    return ModerationResult(
        False,
        reason=(
            "Possible personal or sensitive identifiers detected ("
            + ", ".join(kinds)
            + ")."
        ),
        layer="regex_pii",
    )


def _categories_as_dict(categories: object) -> dict[str, bool]:
    if hasattr(categories, "model_dump"):
        raw = categories.model_dump()  # type: ignore[union-attr]
    elif hasattr(categories, "dict"):
        raw = categories.dict()  # type: ignore[union-attr]
    else:
        raw = dict(categories)  # type: ignore[arg-type]
    out: dict[str, bool] = {}
    for k, v in raw.items():
        if v is True:
            out[k] = True
    return out


def moderate_prompt_openai(text: str) -> ModerationResult:
    client = _client()
    res = client.moderations.create(model="omni-moderation-latest", input=text)
    r = res.results[0]
    if r is None:
        return ModerationResult(False, "Moderation returned no result.", "openai_moderation")
    if not r.flagged:
        return ModerationResult(True)

    flagged: list[str] = []
    cats = _categories_as_dict(r.categories)
    for k, v in cats.items():
        if v and k in BLOCK_CATEGORIES:
            flagged.append(k)

    if not flagged:
        return ModerationResult(True)

    return ModerationResult(
        False,
        reason="Content blocked by moderation policy.",
        layer="openai_moderation",
    )


def moderate_user_prompt(text: str) -> ModerationResult:
    t = text.strip()
    if not t:
        return ModerationResult(False, "Message is empty.", "regex_pii")
    pii = screen_prompt_for_pii(t)
    if not pii.allowed:
        return pii
    return moderate_prompt_openai(t)


def _hallucination_warnings(text: str) -> list[str]:
    w: list[str] = []
    for rx in HALLUCINATION_HINTS:
        if rx.search(text):
            w.append("overconfident_or_unverifiable_claim")
            break
    if re.search(r"\bhttps?://\S+", text):
        w.append("contains_urls_verify_with_adult")
    return w


def _age_bad(text: str) -> bool:
    return any(rx.search(text) for rx in AGE_BAD)


def moderate_output_openai(text: str) -> tuple[bool, list[str]]:
    client = _client()
    res = client.moderations.create(model="omni-moderation-latest", input=text)
    r = res.results[0]
    if r is None or not r.flagged:
        return False, []
    cats = _categories_as_dict(r.categories)
    bad = [k for k, v in cats.items() if v and k in OUTPUT_BLOCK_CATEGORIES]
    return (len(bad) > 0, bad)


def guardrail_llm_output(raw: str, *, prepend_reminder: bool = True) -> dict[str, Any]:
    mod_flagged, mod_cats = moderate_output_openai(raw)
    if mod_flagged:
        return {
            "ok": False,
            "text": SAFE_FALLBACK,
            "warnings": [f"moderation:{c}" for c in mod_cats],
            "blocked": True,
            "block_reason": "output_moderation",
        }

    if _age_bad(raw):
        return {
            "ok": False,
            "text": SAFE_FALLBACK,
            "warnings": ["age_inappropriate_language"],
            "blocked": True,
            "block_reason": "age_inappropriate_language",
        }

    warnings = _hallucination_warnings(raw)
    text = raw
    if prepend_reminder and warnings:
        text = (
            "Remember: double-check important facts with a teacher or parent.\n\n" + raw
        )

    return {
        "ok": True,
        "text": text,
        "warnings": warnings,
        "blocked": False,
    }
