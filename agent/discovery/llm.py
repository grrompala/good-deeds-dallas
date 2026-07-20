"""The one file to change when swapping LLM providers (tech plan §3, §8).

Mirrors the make_client/call_llm convention already used across the repo's
scrapers (fetch_curated.py, qc_filter.py, classify_listings.py) so the agent
speaks the same dialect. OpenAI today; flip DISCOVERY_PROVIDER=anthropic (and
set ANTHROPIC_API_KEY) to run the whole agent on the Claude API with no other
code change.
"""

from __future__ import annotations

import json
import os

from dotenv import load_dotenv

load_dotenv()


def detect_provider() -> str:
    """Prefer an explicit choice, else pick by whichever key is present."""
    explicit = os.environ.get("DISCOVERY_PROVIDER")
    if explicit:
        return explicit
    if os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY"):
        return "openai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    raise SystemExit(
        "No LLM API key found. Set OPENAI_API_KEY (or OPEN_AI_KEY), or "
        "ANTHROPIC_API_KEY with DISCOVERY_PROVIDER=anthropic, in your .env."
    )


def make_client(provider: str):
    """Return a provider client. Kept import-lazy so a missing SDK for the
    provider you're *not* using never blocks a run."""
    if provider == "anthropic":
        import anthropic
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise SystemExit("ANTHROPIC_API_KEY not set.")
        return anthropic.Anthropic(api_key=key)
    if provider == "openai":
        import openai
        key = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY")
        if not key:
            raise SystemExit("OPENAI_API_KEY / OPEN_AI_KEY not set.")
        return openai.OpenAI(api_key=key)
    raise SystemExit(f"Unknown provider: {provider}")


def call_llm(client, provider: str, model: str, prompt: str,
             max_tokens: int = 1024, temperature: float = 0) -> str:
    """Single-turn completion. Returns the raw text content."""
    if provider == "anthropic":
        msg = client.messages.create(
            model=model, max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    resp = client.chat.completions.create(
        model=model, temperature=temperature, max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content.strip()


def parse_json(raw: str):
    """Tolerant JSON parse: strips ```json fences the model sometimes adds.
    Returns the parsed value, or None on failure. Same shape as the scrapers'."""
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.lstrip().startswith("json"):
            raw = raw.lstrip()[4:]
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


class LLM:
    """Thin bound handle so nodes call self.mini(prompt) / self.full(prompt)
    without threading provider/model through every call site."""

    def __init__(self, provider: str, client, mini_model: str, full_model: str):
        self.provider = provider
        self.client = client
        self.mini_model = mini_model
        self.full_model = full_model

    @classmethod
    def build(cls, provider: str | None, mini_model: str, full_model: str) -> "LLM":
        provider = provider or detect_provider()
        return cls(provider, make_client(provider), mini_model, full_model)

    def mini(self, prompt: str, max_tokens: int = 512) -> str:
        return call_llm(self.client, self.provider, self.mini_model, prompt, max_tokens)

    def full(self, prompt: str, max_tokens: int = 1024) -> str:
        return call_llm(self.client, self.provider, self.full_model, prompt, max_tokens)
