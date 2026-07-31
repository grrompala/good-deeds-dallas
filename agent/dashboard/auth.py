"""Access control for the discovery dashboard, needed because it deploys to a
public Streamlit Community Cloud URL (Community Cloud has no free per-user
auth) — a single shared password, not real per-person identity: whoever enters
DASHBOARD_PASSWORD correctly unlocks the app for their browser session.

Also bootstraps Streamlit Cloud's `st.secrets` into `os.environ`, since every
other module in this codebase reads config via `os.getenv`/`os.environ`, not
`st.secrets` (`agent/discovery/llm.py`, `tools.py`, and the scripts `session.py`
shells out to for "Scrape pending"). Call `require_password()` at the very top
of every page — it does both, and is safe to call from more than one page in
the same run since Streamlit re-executes the calling page's script on each
rerun/navigation.

Locally (nothing configured in st.secrets / DASHBOARD_PASSWORD unset), both
are no-ops — nobody needs a password to run `streamlit run` on their own
machine, and the existing `.env`/`load_dotenv()` path keeps working untouched.
"""

from __future__ import annotations

import os

import streamlit as st


def _bootstrap_secrets() -> None:
    """Copy any Streamlit Cloud secrets into os.environ. Safe to call with no
    secrets.toml / no cloud secrets configured at all (plain local dev)."""
    try:
        for k, v in st.secrets.items():
            os.environ.setdefault(k, str(v))
    except Exception:
        pass  # nothing configured — nothing to copy


def require_password() -> None:
    """Block the rest of the page until DASHBOARD_PASSWORD is entered
    correctly. No-op if it isn't configured (local dev)."""
    _bootstrap_secrets()

    expected = os.environ.get("DASHBOARD_PASSWORD")
    if not expected or st.session_state.get("authed"):
        return

    st.title("🔒 Discovery Dashboard")
    with st.form("login", clear_on_submit=True):
        entered = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Unlock")
    if submitted:
        if entered == expected:
            st.session_state.authed = True
            st.rerun()
            return  # rerun halts the script; explicit for clarity/safety
        st.error("Wrong password.")
    st.stop()
