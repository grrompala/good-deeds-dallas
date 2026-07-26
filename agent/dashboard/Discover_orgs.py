"""Discovery dashboard — "Discover orgs" workflow (Streamlit). Thin layer over
session.py. This is the dashboard's entry script; the sidebar nav also exposes
the "Scrape pending" page (agent/dashboard/pages/).

    streamlit run agent/dashboard/Discover_orgs.py

Needs TAVILY_API_KEY (search) and OPENAI_API_KEY (investigate) in your env/.env.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# Allow `streamlit run agent/dashboard/Discover_orgs.py` from the repo root to
# import the agent packages (root on sys.path).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from agent.dashboard import session  # noqa: E402
from agent.discovery import config, tools  # noqa: E402

st.set_page_config(page_title="Discovery Dashboard", page_icon="🔎", layout="wide")

STAGES = ["build", "triage", "verdicts", "drafts"]


def reset():
    for k in ("stage", "gstate", "verdicts", "drafts_rows", "finish"):
        st.session_state.pop(k, None)
    st.session_state.stage = "build"


if "stage" not in st.session_state:
    reset()

# ── sidebar: config + progress ───────────────────────────────────────────────
with st.sidebar:
    st.header("Discovery")
    stage = st.session_state.stage
    st.caption("Pipeline")
    for s in STAGES:
        mark = "▶️" if s == stage else ("✅" if STAGES.index(s) < STAGES.index(stage) else "▫️")
        st.write(f"{mark} {s}")
    st.divider()
    max_candidates = st.slider("Max candidates to investigate", 1, 40, 15)
    confidence = st.slider("Accept threshold (confidence)", 0.0, 1.0, 0.6, 0.05)
    ignore_ledger = st.toggle("Fresh run (ignore ledger)", value=False,
                              help="Don't filter by, or save to, the verdict ledger — "
                                   "lets you re-investigate domains you've seen before.")
    st.divider()
    if st.button("↻ Reset session", use_container_width=True):
        reset()
        st.rerun()

cfg = session.build_config(max_candidates, confidence, ignore_ledger)


def get_llm():
    if "llm" not in st.session_state:
        st.session_state.llm = session.build_llm(cfg)
    return st.session_state.llm


# ── persistent app header (every stage) ──────────────────────────────────────
st.title("🔎 Good Deeds Dallas - Discovery Agent")
st.caption("Finds DFW nonprofits we don't cover yet and proposes them for Good Deeds Dallas · "
           "step through search → triage → investigate → review, then open a PR.")
st.divider()

# ── stage: build query ───────────────────────────────────────────────────────
if st.session_state.stage == "build":
    st.header("① Build a query")
    st.caption("Pick cause + city presets, add any freeform queries, then run search.")
    col1, col2 = st.columns(2)
    with col1:
        causes = st.multiselect("Cause / role", config.CAUSE_PHRASES,
                                default=config.CAUSE_PHRASES[:2])
    with col2:
        cities = st.multiselect("City (DFW)", config.DFW_CITIES,
                                default=["Dallas"])
    freeform = st.text_area("Freeform queries (one per line, optional)",
                            placeholder="refugee resettlement volunteer Vickery Meadow\n"
                                        "community garden volunteer Oak Cliff")
    queries = session.build_queries(causes, cities, freeform.splitlines())
    st.caption(f"{len(queries)} quer{'y' if len(queries)==1 else 'ies'} will run:")
    if queries:
        st.code("\n".join(queries), language=None)

    if st.button("Run search →", type="primary", disabled=not queries):
        try:
            with st.spinner(f"Searching {len(queries)} quer{'y' if len(queries)==1 else 'ies'}…"):
                state = session.new_state(cfg, queries)
                state = session.run_search(cfg, state)
            st.session_state.gstate = state
            st.session_state.stage = "triage"
            st.rerun()
        except SystemExit as e:
            st.error(str(e))
        except Exception as e:
            st.error(f"Search failed: {e}")

# ── stage: triage ────────────────────────────────────────────────────────────
elif st.session_state.stage == "triage":
    state = st.session_state.gstate
    st.header("② Triage")
    rows = session.triage_rows(state)
    kept_default = sum(1 for r in rows if r["keep"])
    st.caption(f"{len(rows)} candidate(s) found · {kept_default} pass automatic triage. "
               "Toggle **keep** to override (rescue a dropped one, or drop a kept one). "
               f"Up to {cfg.max_candidates} kept will be investigated.")

    df = pd.DataFrame(rows)[["keep", "name", "domain", "drop_reason", "url", "snippet"]]
    edited = st.data_editor(
        df, use_container_width=True, hide_index=True, height=420,
        column_config={
            "keep": st.column_config.CheckboxColumn("keep", width="small"),
            "drop_reason": st.column_config.TextColumn("auto-triage", disabled=True),
            "url": st.column_config.LinkColumn("url"),
            "snippet": st.column_config.TextColumn("search snippet", width="large"),
        },
        disabled=["name", "domain", "drop_reason", "url", "snippet"],
    )
    kept = [r for r in edited.to_dict("records") if r["keep"]][: cfg.max_candidates]

    c1, c2 = st.columns([1, 4])
    if c1.button("← Back"):
        st.session_state.stage = "build"
        st.rerun()
    if c2.button(f"Investigate {len(kept)} candidate(s) →", type="primary", disabled=not kept):
        try:
            prog = st.progress(0.0, "Investigating…")
            def cb(i, total, c):
                prog.progress(i / total, f"Investigating {i}/{total}: {c.get('domain')}")
            verdicts = session.investigate(cfg, get_llm(),
                                           [{"name": r["name"], "domain": r["domain"],
                                             "url": r["url"], "snippet": r.get("snippet", "")}
                                            for r in kept],
                                           on_progress=cb)
            st.session_state.verdicts = verdicts
            st.session_state.stage = "verdicts"
            st.rerun()
        except Exception as e:
            st.error(f"Investigation failed: {e}")

# ── stage: verdicts ──────────────────────────────────────────────────────────
elif st.session_state.stage == "verdicts":
    verdicts = st.session_state.verdicts
    accepts = [v for v in verdicts if v.get("decision") == "accept"]
    st.header("③ Verdicts")
    st.caption(f"{len(verdicts)} investigated · {len(accepts)} accepted. "
               f"Entries below the {cfg.confidence_threshold:.2f} threshold won't become drafts.")
    for v in sorted(verdicts, key=lambda x: (x.get("decision") != "accept", -(x.get("confidence") or 0))):
        acc = v.get("decision") == "accept"
        conf = v.get("confidence") or 0
        with st.expander(f"{'✅' if acc else '❌'} {v.get('name') or v.get('domain')} "
                         f"— {v.get('decision','?')} ({conf:.2f})", expanded=acc):
            st.write(f"**Why:** {v.get('reason','')}")
            if v.get("volunteer_url"):
                st.write(f"**Volunteer page:** {v['volunteer_url']}")
            for q in v.get("evidence_quotes") or []:
                st.write(f"> {q}")

    c1, c2 = st.columns([1, 4])
    if c1.button("← Back"):
        st.session_state.stage = "triage"
        st.rerun()
    if c2.button("Build drafts →", type="primary"):
        drafts = session.select_drafts(cfg, verdicts)
        st.session_state.drafts_rows = session.drafts_to_rows(drafts)
        st.session_state.stage = "drafts"
        st.rerun()

# ── stage: drafts (edit + finish) ────────────────────────────────────────────
elif st.session_state.stage == "drafts":
    st.header("④ Edit drafts & finish")
    rows = st.session_state.drafts_rows
    if not rows:
        st.warning("No accepted orgs cleared the confidence threshold. Go back and "
                   "lower it, or re-investigate.")
    else:
        st.caption("Edit anything below — this is the review. Uncheck **include** to drop a row. "
                   "Causes are comma-separated (from the 18-tag taxonomy).")
        df = pd.DataFrame(rows)
        edited = st.data_editor(
            df, use_container_width=True, hide_index=True, num_rows="dynamic",
            column_config={
                "include": st.column_config.CheckboxColumn("include", width="small"),
                "cause": st.column_config.TextColumn("cause (taxonomy, comma-sep)"),
                "volunteer_url": st.column_config.LinkColumn("volunteer_url"),
            },
        )
        drafts = session.rows_to_drafts(edited.to_dict("records"))
        st.caption(f"{len(drafts)} org(s) will be written. Taxonomy: {', '.join(tools.TAXONOMY)}")

        st.divider()
        c1, c2, c3 = st.columns(3)
        if c1.button(f"🔀 Open PR ({len(drafts)})", type="primary", disabled=not drafts):
            try:
                with st.spinner("Branch, commit, push…"):
                    res = session.open_pr(cfg, drafts, st.session_state.verdicts)
                st.session_state.finish = res
            except Exception as e:
                st.error(f"PR failed: {e}")
        if c2.button(f"💾 Write to orgs.json ({len(drafts)})", disabled=not drafts):
            try:
                st.success(session.write_local(drafts))
            except Exception as e:
                st.error(f"Write failed: {e}")
        c3.download_button("⬇️ Download JSON", json.dumps(drafts, indent=2, ensure_ascii=False),
                           file_name="discovery_drafts.json", disabled=not drafts)

        fin = st.session_state.get("finish")
        if fin:
            if fin.get("via") == "gh":
                st.success(f"PR opened: {fin['url']}")
            elif fin.get("url"):
                st.success(f"Pushed **{fin['branch']}**. Open the PR: {fin['url']}")
            else:
                st.info(f"Pushed **{fin['branch']}** — open a PR on GitHub for it.")

    if st.button("← Back"):
        st.session_state.stage = "verdicts"
        st.rerun()
